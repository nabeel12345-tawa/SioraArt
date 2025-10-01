from pathlib import Path
import re

path = Path('Style.css')
text = path.read_text(encoding='utf-8')

def replace_block(source, selector, new_block):
    pattern = re.compile(rf"{re.escape(selector)} \{{.*?\}}", re.S)
    if not pattern.search(source):
        raise SystemExit(f'Block not found for {selector!r}')
    return pattern.sub(new_block, source, count=1)

# Update hero block and remove pseudo overlay
text = replace_block(text, '.hero', ".hero {\n  position: relative;\n  max-width: 1180px;\n  margin: 0 auto;\n  padding: 120px 24px 100px;\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 60px;\n  align-items: center;\n}\n")

hero_before_pattern = re.compile(r"\\.hero::before \{.*?\}\n", re.S)
if not hero_before_pattern.search(text):
    raise SystemExit('hero::before block not found')
text = hero_before_pattern.sub('', text, count=1)

# Remove background declarations from section wrappers
for selector in ['.process', '.orders', '.contact']:
    pattern = re.compile(rf"({re.escape(selector)} \{{)(.*?)(\}})", re.S)
    match = pattern.search(text)
    if not match:
        raise SystemExit(f'Block not found for {selector}')
    start, content, end = match.groups()
    lines = content.split('\n')
    lines = [line for line in lines if 'background:' not in line]
    replacement = start + '\n'.join(lines).rstrip() + '\n' + end
    text = text[:match.start()] + replacement + text[match.end():]

# Simplify card backgrounds
replacements = {
    'background: rgba(255, 255, 255, 0.92);\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-soft);': 'border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-soft);',
}
for old, new in replacements.items():
    text = text.replace(old, new)

simple_swaps = {
    'background: rgba(255, 255, 255, 0.92);': 'background: rgba(255, 255, 255, 0.95);',
    'background: rgba(255, 255, 255, 0.9);': 'background: rgba(255, 255, 255, 0.96);',
    'background: rgba(255, 255, 255, 0.95);': 'background: rgba(255, 255, 255, 0.96);'
}
for old, new in simple_swaps.items():
    text = text.replace(old, new)

path.write_text(text, encoding='utf-8')
