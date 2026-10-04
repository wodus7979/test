"""Build an original mutant from CC0 MakeHuman topology using MPFB + Blender 4.5.
Run with Blender --background --python build_base.py. No network/API calls.
"""
import bpy, bmesh, sys, os, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]/'Assets/Kairos'
(ROOT.parents[2]/'output/kairos').mkdir(parents=True,exist_ok=True)
(ROOT/'Models').mkdir(parents=True,exist_ok=True)
(ROOT/'Textures').mkdir(parents=True,exist_ok=True)
TOOLS=Path(os.environ.get('MUTANT_TOOLS','/private/tmp/mutant-tools'))
bpy.utils.extension_path_user=lambda *a,**k:str(TOOLS/'mpfb-user')
bpy.context.preferences.addons.new().module='mpfb'
sys.path.insert(0,str(TOOLS/'mpfb2/src'))
import mpfb
mpfb.register()
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.locationservice import LocationService
from mpfb.services.exportservice import ExportService
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
macro=TargetService.get_default_macro_info_dict()
macro.update(gender=1.,age=.46,muscle=1.,weight=.62,proportions=.65,height=.75)
macro['race']={'asian':.04,'african':.88,'caucasian':.08}
body=HumanService.create_human(macro_detail_dict=macro)
def target(name,weight):
    p=Path(LocationService.get_mpfb_data('targets'))/(name+'.target.gz')
    if not p.exists():raise RuntimeError(str(p))
    TargetService.load_target(body,str(p),weight=weight)
for name,value in {
 'torso/torso-vshape-incr':1.1,'torso/torso-muscle-dorsi-incr':1.25,
 'torso/torso-muscle-pectoral-incr':.9,'torso/torso-scale-horiz-incr':.7,
 'torso/torso-scale-depth-incr':.5,'torso/measure-shoulder-dist-incr':.75,
 'neck/neck-scale-horiz-incr':.85,'neck/neck-scale-depth-incr':.6,
 'neck/neck-back-scale-depth-incr':.55,'neck/neck-scale-vert-decr':.25,
 'head/head-square':.45,'chin/chin-width-incr':.6,'chin/chin-bones-incr':.65,
 'chin/chin-prominent-incr':.32,'eyebrows/eyebrows-trans-forward':.7,
 'eyebrows/eyebrows-angle-down':.35,'forehead/forehead-trans-forward':.2,
 'nose/nose-scale-horiz-incr':.2,'stomach/stomach-tone-incr':1.0,
}.items():target(name,value)
for side in ['l','r']:
 for part in ['upperarm','lowerarm']:
  target(f'arms/{side}-{part}-muscle-incr',1.15)
  target(f'arms/{side}-{part}-scale-depth-incr',.75)
  target(f'arms/{side}-{part}-scale-horiz-incr',.65)
 target(f'arms/{side}-upperarm-shoulder-muscle-incr',1.1)
 for part in ['upperleg','lowerleg']:
  target(f'legs/{side}-{part}-muscle-incr',.85)
  target(f'legs/{side}-{part}-scale-depth-incr',.35)
  target(f'legs/{side}-{part}-scale-horiz-incr',.25)
 target(f'hands/{side}-hand-scale-incr',.45)
 target(f'hands/{side}-hand-fingers-diameter-incr',.35)
# Final shape evaluated before fitting bones / assets, so joints follow the body.
bpy.context.view_layer.update()
rig=HumanService.add_builtin_rig(body,'mixamo_unity')
rig.name='KairosRig';body.name='Body'
assets=TOOLS/'assets'
for sub,file,atype in [('eyes','low-poly','Eyes'),('hair','short01','Hair')]:
 paths=list(assets.rglob(file+'.mhclo'))
 if paths:
  HumanService.add_mhclo_asset(str(paths[0]),body,asset_type=atype,material_type='GAMEENGINE',subdiv_levels=0)
# Bake shape keys, retain deform armature; remove helpers by body mask.
bpy.context.view_layer.objects.active=body
body.select_set(True)
bpy.ops.object.shape_key_remove(all=True,apply_mix=True)
ExportService.bake_modifiers_remove_helpers(body,bake_masks=True,bake_subdiv=False,remove_helpers=True)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
for o in meshes:
 for m in list(o.modifiers):
  if m.type not in {'ARMATURE'}:o.modifiers.remove(m)
# Continuous weighted physique deformation preserves anatomical edge loops.
old={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in rig.data.bones}
def broaden(p):
 q=p.copy();q.x*=1.06;return q
def legshift(name):
 return .042 if name.split(':')[-1] in ['LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','LeftButtock'] else -.042 if name.split(':')[-1] in ['RightUpLeg','RightLeg','RightFoot','RightToeBase','RightButtock'] else 0

def muscle(p,name):
 if name not in old:return broaden(p)
 head,tail=old[name];axis=(tail-head).normalized();v=p-head
 bone=name.split(':')[-1]
 radial=1.
 if bone.endswith('Arm') and 'Fore' not in bone:radial=1.36
 elif bone.endswith('ForeArm'):radial=1.28
 elif bone.endswith('UpLeg'):radial=1.08
 elif bone.endswith('Leg'):radial=1.08
 along=axis*v.dot(axis)
 q=head+along+(v-along)*radial
 if bone in ['Spine1','Spine2','LeftBreast','RightBreast']:
  q.y=head.y+(p.y-head.y)*1.15
 elif bone=='Neck':q.x*=1.23;q.y=head.y+(p.y-head.y)*1.25
 q=broaden(q);q.x+=legshift(name);return q
for v in body.data.vertices:
 p=v.co.copy();q=Vector();total=0
 for g in v.groups:
  name=body.vertex_groups[g.group].name
  if name in old:q+=muscle(p,name)*g.weight;total+=g.weight
 v.co=q/total if total>0 else broaden(p)
for o in meshes:
 if o!=body:
  for v in o.data.vertices:v.co=broaden(v.co)
bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
 b.head=broaden(b.head)+Vector((legshift(b.name),0,0));b.tail=broaden(b.tail)+Vector((legshift(b.name),0,0))
bpy.ops.object.mode_set(mode='OBJECT')
# Scale all geometry and the rig together to 2.30 m (hair included).
bpy.context.view_layer.update()
lo=min((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
hi=max((o.matrix_world@v.co).z for o in meshes for v in o.data.vertices)
scale=2.3/(hi-lo)
for o in meshes:
 for v in o.data.vertices:v.co=(v.co-Vector((0,0,lo)))*scale
bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
 b.head=(b.head-Vector((0,0,lo)))*scale;b.tail=(b.tail-Vector((0,0,lo)))*scale
 # Keep names portable and explicit for Unity HumanDescription mapping.
 b.name=b.name.replace('mixamorig:','')
bpy.ops.object.mode_set(mode='OBJECT')
for o in meshes:
 for g in o.vertex_groups:g.name=g.name.replace('mixamorig:','')

bpy.ops.wm.save_as_mainfile(filepath=str(ROOT.parents[2]/'output/kairos/KairosBase.blend'))
print("KAIROS_BASE_READY",flush=True)
