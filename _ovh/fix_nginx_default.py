#!/usr/bin/env python3
# Supprime les blocs server pour quali-form.mullerautomotive.fr du fichier default
# Ces blocs sont geres par /etc/nginx/sites-available/quali-form

f = '/etc/nginx/sites-enabled/default'
content = open(f).read()

# Supprimer les server blocks qui contiennent quali-form.mullerautomotive.fr
# On cherche chaque bloc "server {" et on garde seulement ceux qui N'ont PAS quali-form
import re

# Extraire tous les blocs server {}
blocks = re.split(r'\nserver\s*\{', content)
result = []
for i, block in enumerate(blocks):
    if i == 0:
        # Premier morceau (avant le premier "server {") = entete du fichier
        result.append(block)
    else:
        if 'quali-form.mullerautomotive.fr' not in block:
            result.append('\nserver {' + block)
        else:
            print(f'Bloc quali-form supprime (debut: {block[:80].strip()!r})')

final = ''.join(result)
open(f, 'w').write(final)
print('OK - fichier mis a jour')
print(f'Blocs restants: {final.count("server {")}')
