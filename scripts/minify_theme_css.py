import re

SRC = "/Users/hajimeataka/simplememo/assets/css/theme-midnight.css"
DST = "/Users/hajimeataka/simplememo/assets/css/theme-midnight.min.css"

with open(SRC, "r") as f:
    css = f.read()

css = re.sub(r'/\*.*?\*/', '', css, flags=re.DOTALL)
css = re.sub(r'\s+', ' ', css)
css = re.sub(r'\s*{\s*', '{', css)
css = re.sub(r'\s*}\s*', '}', css)
css = re.sub(r'\s*;\s*', ';', css)
css = re.sub(r'\s*:\s*', ':', css)
css = re.sub(r'\s*,\s*', ',', css)
css = re.sub(r';}', '}', css)
css = re.sub(r'(\d)(\s+)(0%)', r'\1 \3', css)
css = css.strip()

with open(DST, "w") as f:
    f.write(css)

print(f"Minified theme CSS: {len(css)} bytes")
