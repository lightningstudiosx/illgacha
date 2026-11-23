"""A small evaluator for Firebase Realtime Database security rules (tests only).

It parses the real rule strings from a rules JSON file (no hand-written mirror) and applies
multi-path updates the way the Realtime Database does:
  * a write is allowed if any ".write" rule at or above each written path is true;
  * ".validate" runs for every ancestor of a written path and every node inside the written value
    whose new value is not null; any false (or any error, e.g. null + 1) refuses the whole write;
  * $wildcards capture keys, "now" is the server time, {".sv": "timestamp"} becomes now.
Supported: data/newData/root snapshots (child, parent, val, exists, hasChild, hasChildren, isNumber,
isString, isBoolean), string .length/.matches/.contains/.beginsWith/.endsWith, + - * / % ! && || ?:,
=== !== == != < <= > >=, regex literals, auth.uid.
"""
import copy, json, re

TOK = re.compile(r"\s*(?:(\d+\.?\d*)|('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")|(\$?[A-Za-z_][A-Za-z0-9_]*)|"
                 r"(===|!==|==|!=|<=|>=|&&|\|\||[-+*/%!<>?:().,\[\]]))")


class RuleError(Exception):
    pass


def tokenize(s):
    out, i = [], 0
    while i < len(s):
        if s[i].isspace():
            i += 1; continue
        if s[i] == '/' and (not out or out[-1][0] == 'op' and out[-1][1] in '(,!&&||?:==='):
            j = i + 1
            while s[j] != '/':
                j += 2 if s[j] == '\\' else 1
            k = j + 1
            while k < len(s) and s[k].isalpha():
                k += 1
            out.append(('re', re.compile(s[i + 1:j].replace('\\/', '/'), re.I if 'i' in s[j + 1:k] else 0))); i = k; continue
        m = TOK.match(s, i)
        if not m:
            raise RuleError('bad token at %r' % s[i:i + 20])
        num, st, name, op = m.groups()
        if num: out.append(('num', float(num)))
        elif st: out.append(('str', bytes(st[1:-1], 'utf-8').decode('unicode_escape')))
        elif name: out.append(('name', name))
        else: out.append(('op', op))
        i = m.end()
    return out + [('end', None)]


class Snap:
    def __init__(s, tree, path): s.tree, s.path = tree, path
    def _v(s):
        node = s.tree
        for k in s.path:
            if not isinstance(node, dict) or k not in node: return None
            node = node[k]
        return node
    def child(s, p):
        if not isinstance(p, str): raise RuleError('child() needs a string')
        return Snap(s.tree, s.path + [x for x in p.split('/') if x])
    def parent(s):
        if not s.path: raise RuleError('root has no parent')
        return Snap(s.tree, s.path[:-1])
    def val(s):
        v = s._v(); return copy.deepcopy(v)
    def exists(s): return s._v() is not None
    def hasChild(s, k): return s.child(k).exists()
    def hasChildren(s, ks=None):
        v = s._v()
        return isinstance(v, dict) and (all(k in v for k in ks) if ks is not None else bool(v))
    def isNumber(s): v = s._v(); return isinstance(v, (int, float)) and not isinstance(v, bool)
    def isString(s): return isinstance(s._v(), str)
    def isBoolean(s): return isinstance(s._v(), bool)


def num(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)): raise RuleError('not a number: %r' % (v,))
    return v


class Parser:
    def __init__(s, src, env): s.t, s.i, s.env = tokenize(src), 0, env
    def peek(s): return s.t[s.i]
    def take(s, op=None):
        tok = s.t[s.i]
        if op and tok != ('op', op): raise RuleError('expected %s got %r' % (op, tok))
        s.i += 1; return tok
    def is_op(s, *ops): return s.peek()[0] == 'op' and s.peek()[1] in ops
    # Lazy evaluation: every parse function returns a thunk so && || ?: short-circuit like Firebase.
    def expr(s):
        c = s.orr()
        if s.is_op('?'):
            s.take(); a = s.expr(); s.take(':'); b = s.expr()
            return lambda: a() if truthy(c()) else b()
        return c
    def binary(s, sub, ops, fn):
        left = sub()
        while s.is_op(*ops):
            op = s.take()[1]; right = sub(); left = fn(op, left, right)
        return left
    def orr(s): return s.binary(s.andd, ('||',), lambda o, a, b: lambda: truthy(a()) or truthy(b()))
    def andd(s): return s.binary(s.eq, ('&&',), lambda o, a, b: lambda: truthy(a()) and truthy(b()))
    def eq(s): return s.binary(s.rel, ('===', '!==', '==', '!='), lambda o, a, b: lambda: same(a(), b()) == (o in ('===', '==')))
    def rel(s):
        f = {'<': lambda x, y: x < y, '<=': lambda x, y: x <= y, '>': lambda x, y: x > y, '>=': lambda x, y: x >= y}
        return s.binary(s.add, tuple(f), lambda o, a, b: lambda: f[o](*cmp_args(a(), b())))
    def add(s):
        def mk(o, a, b):
            def go():
                x, y = a(), b()
                if o == '+' and (isinstance(x, str) or isinstance(y, str)):
                    if x is None or y is None: raise RuleError('null in concat')
                    return tostr(x) + tostr(y)
                return num(x) + num(y) if o == '+' else num(x) - num(y)
            return go
        return s.binary(s.mul, ('+', '-'), mk)
    def mul(s):
        f = {'*': lambda x, y: x * y, '/': lambda x, y: x / y, '%': lambda x, y: x % y}
        return s.binary(s.unary, tuple(f), lambda o, a, b: lambda: f[o](num(a()), num(b())))
    def unary(s):
        if s.is_op('!'): s.take(); a = s.unary(); return lambda: not truthy(a())
        if s.is_op('-'): s.take(); a = s.unary(); return lambda: -num(a())
        return s.postfix()
    def postfix(s):
        node = s.primary()
        while s.is_op('.', '['):
            if s.take()[1] == '[':
                raise RuleError('[] indexing not supported')
            name = s.take()[1]
            if s.is_op('('):
                s.take(); args = []
                while not s.is_op(')'):
                    args.append(s.expr())
                    if s.is_op(','): s.take()
                s.take(')')
                node = (lambda n, nm, a: lambda: call(n(), nm, [x() for x in a]))(node, name, args)
            else:
                node = (lambda n, nm: lambda: prop(n(), nm))(node, name)
        return node
    def primary(s):
        kind, v = s.take()
        if kind in ('num', 'str', 're'): return lambda: v
        if kind == 'op' and v == '(':
            e = s.expr(); s.take(')'); return e
        if kind == 'op' and v == '[':
            items = []
            while not s.is_op(']'):
                items.append(s.expr())
                if s.is_op(','): s.take()
            s.take(']'); return lambda: [x() for x in items]
        if kind == 'name':
            if v in ('true', 'false'): return lambda: v == 'true'
            if v == 'null': return lambda: None
            if v not in s.env: raise RuleError('unknown name ' + v)
            return lambda: s.env[v]
        raise RuleError('unexpected %r' % ((kind, v),))


def truthy(v):
    if not isinstance(v, bool): raise RuleError('not a boolean: %r' % (v,))
    return v
def same(a, b): return type(a) == type(b) and a == b if not (isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool)) else float(a) == float(b)
def tostr(v): return ('%d' % v if float(v).is_integer() else repr(v)) if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v)
def cmp_args(a, b):
    if isinstance(a, str) and isinstance(b, str): return a, b
    return num(a), num(b)
def prop(o, name):
    if isinstance(o, dict): return o.get(name)
    if isinstance(o, str) and name == 'length': return len(o.encode('utf-16-le')) // 2
    raise RuleError('no property %s on %r' % (name, o))
def call(o, name, args):
    if isinstance(o, Snap): return getattr(o, name)(*args)
    if isinstance(o, str):
        f = {'matches': lambda r: bool(r.search(o)), 'contains': lambda x: x in o, 'beginsWith': o.startswith,
             'endsWith': o.endswith, 'toLowerCase': o.lower, 'toUpperCase': o.upper}
        if name in f: return f[name](*args)
    raise RuleError('no method %s on %r' % (name, o))


def evaluate(src, env):
    if isinstance(src, bool): return src
    p = Parser(src, env); fn = p.expr()
    if p.peek()[0] != 'end': raise RuleError('trailing tokens in %r' % src)
    try:
        return truthy(fn())
    except (RuleError, TypeError, ZeroDivisionError, KeyError, AttributeError):
        return False
