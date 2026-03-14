"""Insert categoryToIconFile + vehicleIconHtml into AthenaMap.tsx before vehicleSvg."""
import sys, os

file_path = os.path.join(os.path.dirname(__file__), '..', 'Frontend', 'src', 'components', 'AthenaMap.tsx')
file_path = os.path.abspath(file_path)

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = 'function vehicleSvg(category: string, color: string, dir: number, vehicleClass?: string): string {'
idx = content.find(target)
if idx < 0:
    print('ERROR: target not found')
    sys.exit(1)

# Check if already inserted
if 'function categoryToIconFile(' in content:
    print('Already inserted, skipping.')
    sys.exit(0)

BT = '`'  # backtick
DL = '$'  # dollar sign

new_funcs = f'''function categoryToIconFile(category: string, vehicleClass?: string): string {{
  const cl = (vehicleClass ?? '').toLowerCase();
  switch (category) {{
    case 'Cars':          return cl.includes('motorcycle') ? 'iconmotorcycle' : cl.includes('truck') ? 'icontruck' : 'iconcar';
    case 'APCs':          return 'iconapc';
    case 'Tanks':         return 'icontank';
    case 'Helicopters':   return 'iconhelicopter';
    case 'Planes':        return 'iconplane';
    case 'Boats':         return 'iconship';
    case 'Artillery':     return 'iconstaticcannon';
    case 'AAs':           return 'iconstaticaa';
    case 'Submersibles':  return 'iconship';
    case 'Drones': {{
      if (cl.includes('sentinel') || cl.includes('fixedwing'))  return 'iconplane';
      if (cl.includes('ugv') && cl.includes('tracked'))         return 'iconapc';
      if (cl.includes('ugv') && cl.includes('wheeled'))         return 'iconcar';
      return 'iconvehicle';
    }}
    case 'Turrets': {{
      if (cl.includes('sam') || cl.includes('aaa'))             return 'iconstaticaa';
      if (cl.includes('naval'))                                 return 'iconstaticcannon';
      if (cl.includes('mortar'))                                return 'iconstaticmortar';
      return 'iconstaticmg';
    }}
    default:              return 'iconvehicle';
  }}
}}

function vehicleIconHtml(category: string, color: string, dir: number, size: number, vehicleClass?: string): string {{
  const icon = categoryToIconFile(category, vehicleClass);
  return {BT}<div style="width:{DL}{{size}}px;height:{DL}{{size}}px;{BT} +
    {BT}background-color:{DL}{{color}};{BT} +
    {BT}-webkit-mask-image:url(/icons/vehicles/{DL}{{icon}}.png);{BT} +
    {BT}mask-image:url(/icons/vehicles/{DL}{{icon}}.png);{BT} +
    {BT}-webkit-mask-size:contain;mask-size:contain;{BT} +
    {BT}-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;{BT} +
    {BT}-webkit-mask-position:center;mask-position:center;{BT} +
    {BT}transform:rotate({DL}{{dir}}deg);transform-origin:center;{BT} +
    {BT}filter:drop-shadow(1px 0 0 rgba(0,0,0,0.6)) drop-shadow(-1px 0 0 rgba(0,0,0,0.6)) drop-shadow(0 1px 0 rgba(0,0,0,0.6)) drop-shadow(0 -1px 0 rgba(0,0,0,0.6));{BT} +
    {BT}"></div>{BT};
}}

'''

content = content[:idx] + new_funcs + content[idx:]
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print(f'SUCCESS: inserted functions before vehicleSvg at position {idx}')
