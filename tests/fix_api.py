with open('api.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Dedent lines 383-424 (0-indexed: 382-423) by 8 spaces
for i in range(382, 424):
    if i < len(lines):
        line = lines[i]
        if line.startswith('                            '):
            lines[i] = line[8:]

with open('api.py', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('Dedented lines 383-424 in api.py')
