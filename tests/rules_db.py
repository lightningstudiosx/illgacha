"""An in-memory Realtime Database that checks every write against a real rules JSON file (tests only)."""
import copy, json
from pathlib import Path
from rules_engine import Snap, evaluate, Parser, RuleError


def split(path): return [p for p in path.split('/') if p]


def get(tree, segs):
    node = tree
    for k in segs:
        if not isinstance(node, dict) or k not in node: return None
        node = node[k]
    return node


def put(tree, segs, value):
    """Set a value inside a tree (None deletes) and prune empty objects, like Firebase."""
    if not segs: return value if value not in ({}, None) else None
    tree = tree if isinstance(tree, dict) else {}
    node, chain = tree, []
    for k in segs[:-1]:
        if not isinstance(node.get(k), dict): node[k] = {}
        chain.append((node, k)); node = node[k]
    if value is None or value == {}: node.pop(segs[-1], None)
    else: node[segs[-1]] = value
    for parent, k in reversed(chain):
        if parent[k] == {}: parent.pop(k)
    return tree


class RulesDB:
    def __init__(s, rules_file):
        s.rules = json.loads(Path(rules_file).read_text(encoding='utf-8'))['rules']
        s.root, s.log = {}, []

    def rule_children(s, rule, key, env):
        """The rule node for child `key` (exact key wins, else a $wildcard that captures it)."""
        if not isinstance(rule, dict): return None, env
        if key in rule: return rule[key], env
        for k, v in rule.items():
            if k.startswith('$'): return v, dict(env, **{k: key})
        return None, env

    def env(s, path, old, new, vars_, auth, now):
        e = {'data': Snap(old, path), 'newData': Snap(new, path), 'root': Snap(old, []),
             'auth': auth, 'now': now}
        e.update(vars_); return e

    def update(s, base, patch, auth=None, now=0):
        """Multi-path update at `base` (like ref(base).update(patch)). Returns (ok, reason)."""
        sv = lambda v: now if v == {'.sv': 'timestamp'} else {k: sv(x) for k, x in v.items()} if isinstance(v, dict) else v
        writes = [(split(base) + split(k), sv(copy.deepcopy(v))) for k, v in patch.items()]
        old, new = s.root, copy.deepcopy(s.root)
        for segs, v in writes: new = put(new, segs, v) or {}
        for segs, v in writes:
            why = s.check_write(segs, old, new, auth, now)
            if why: s.log.append(('denied', base, why)); return False, why
        seen = set()
        for segs, v in writes:
            why = s.check_validate(segs, old, new, auth, now, seen)
            if why: s.log.append(('invalid', base, why)); return False, why
        s.root = new; s.log.append(('ok', base, None))
        return True, None

    def set(s, path, value, auth=None, now=0):
        segs = split(path)
        return s.update('/'.join(segs[:-1]), {segs[-1]: value}, auth, now)

    def check_write(s, segs, old, new, auth, now):
        rule, vars_ = s.rules, {}
        for depth in range(len(segs) + 1):
            if rule is None: break
            if isinstance(rule, dict) and '.write' in rule:
                if evaluate(rule['.write'], s.env(segs[:depth], old, new, vars_, auth, now)): return None
            if depth < len(segs): rule, vars_ = s.rule_children(rule, segs[depth], vars_)
        return 'no .write grants /' + '/'.join(segs)

    def check_validate(s, segs, old, new, auth, now, seen):
        rule, vars_ = s.rules, {}
        for depth in range(len(segs)):   # ancestors
            why = s.run_validate(rule, segs[:depth], old, new, vars_, auth, now, seen)
            if why: return why
            rule, vars_ = s.rule_children(rule, segs[depth], vars_)
            if rule is None: return None
        return s.validate_tree(rule, segs, old, new, vars_, auth, now, seen)

    def run_validate(s, rule, path, old, new, vars_, auth, now, seen):
        key = '/'.join(path)
        if key in seen or not isinstance(rule, dict) or get(new, path) is None: return None
        seen.add(key)
        if '.validate' in rule and not evaluate(rule['.validate'], s.env(path, old, new, vars_, auth, now)):
            return '.validate failed at /' + key
        return None

    def validate_tree(s, rule, path, old, new, vars_, auth, now, seen):
        why = s.run_validate(rule, path, old, new, vars_, auth, now, seen)
        if why: return why
        value = get(new, path)
        if isinstance(value, dict):
            for k in value:
                sub, v2 = s.rule_children(rule, k, vars_)
                if sub is not None:
                    why = s.validate_tree(sub, path + [k], old, new, v2, auth, now, seen)
                    if why: return why
        return None


def parse_all(rules, names=('data', 'newData', 'root', 'auth', 'now'), wild=()):
    """Parse every .read/.write/.validate string so syntax errors fail loudly. Returns the count."""
    n = 0
    for k, v in rules.items():
        if k in ('.read', '.write', '.validate') and isinstance(v, str):
            env = {x: None for x in names + tuple(wild)}
            Parser(v, env).expr(); n += 1
        elif isinstance(v, dict):
            n += parse_all(v, names, wild + ((k,) if k.startswith('$') else ()))
    return n
