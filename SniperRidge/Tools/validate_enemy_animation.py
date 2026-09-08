"""Inspect FBX skeleton, animation connections, keyframes and moving leg bones without Unity."""
import struct,zlib
from pathlib import Path
class Reader:
 def __init__(self,path):
  self.data=Path(path).read_bytes(); self.offset=27;self.version=struct.unpack_from('<I',self.data,23)[0]
 def unpack(self,fmt):
  result=struct.unpack_from('<'+fmt,self.data,self.offset);self.offset+=struct.calcsize('<'+fmt);return result
 def prop(self):
  t=chr(self.data[self.offset]);self.offset+=1
  fmt={'Y':'h','C':'?','I':'i','F':'f','D':'d','L':'q'}
  if t in fmt:return self.unpack(fmt[t])[0]
  if t in 'SR':
   n=self.unpack('I')[0];s=self.data[self.offset:self.offset+n];self.offset+=n
   return s.decode('utf8',errors='replace') if t=='S' else s
  n,enc,size=self.unpack('III');s=self.data[self.offset:self.offset+size];self.offset+=size
  if enc:s=zlib.decompress(s)
  f={'f':'f','d':'d','l':'q','i':'i','b':'?','c':'b'}[t];return struct.unpack('<'+f*n,s)
 def node(self):
  end,count,size,nlen=self.unpack('QQQB' if self.version>=7500 else 'IIIB')
  if end==0:return None
  name=self.data[self.offset:self.offset+nlen].decode();self.offset+=nlen
  props=[self.prop() for _ in range(count)];children=[]
  while self.offset<end:
   child=self.node()
   if child is None:break
   children.append(child)
  self.offset=end;return {'name':name,'props':props,'children':children}
 def read(self):
  out=[]
  while True:
   n=self.node()
   if n is None:break
   out.append(n)
  return out


def validate(path):
    nodes = Reader(path).read()
    objects = next(n for n in nodes if n['name'] == 'Objects')['children']
    lookup = {n['props'][0]: n for n in objects}
    links = [n['props'] for n in next(n for n in nodes if n['name'] == 'Connections')['children']]
    parents = {}
    for link in links:
        parents.setdefault(link[1], []).append(link[2])
    def parent_of_type(key, kind):
        return next((lookup[p] for p in parents.get(key, []) if lookup.get(p, {}).get('name') == kind), None)
    bone_names = {n['props'][1].split('\x00')[0].split(':')[-1] for n in objects if n['name'] == 'Model' and n['props'][2] == 'LimbNode'}
    required = {'Hips', 'Spine2', 'Head', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot',
                'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'}
    assert required <= bone_names, required - bone_names
    animated = {}
    curve_count = 0
    for curve in objects:
        if curve['name'] != 'AnimationCurve':
            continue
        values = next(n['props'][0] for n in curve['children'] if n['name'] == 'KeyValueFloat')
        times = next(n['props'][0] for n in curve['children'] if n['name'] == 'KeyTime')
        assert len(values) == len(times) and len(values) > 0
        assert all(math.isfinite(v) for v in values)
        assert all(a < b for a, b in zip(times, times[1:]))
        node = parent_of_type(curve['props'][0], 'AnimationCurveNode')
        assert node is not None
        bone = parent_of_type(node['props'][0], 'Model')
        layer = parent_of_type(node['props'][0], 'AnimationLayer')
        assert bone is not None and layer is not None
        stack = parent_of_type(layer['props'][0], 'AnimationStack')
        assert stack is not None
        name = stack['props'][1].split('\x00')[0].split('|')[-1]
        animated.setdefault(name, set())
        if max(values) - min(values) > .001:
            animated[name].add(bone['props'][1].split('\x00')[0].split(':')[-1])
        curve_count += 1
    for name in ('Idle', 'Walk', 'Run'):
        assert name in animated and len(animated[name]) >= 10, (name, animated.get(name))
    for name in ('Walk', 'Run'):
        assert {'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'} <= animated[name]
    print(json.dumps({'bones': len(bone_names), 'curves_checked': curve_count,
        'animated_bones_by_clip': {k: len(v) for k, v in animated.items()},
        'result': 'PASS', 'unity_compilation_and_play_mode': 'NOT RUN'}, indent=2))

if __name__ == '__main__':
    import math, json
    validate(Path(__file__).resolve().parents[1] / 'Assets/EnemyModel/Soldier.fbx')
