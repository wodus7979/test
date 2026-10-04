"""Author the Kairos game surface from the local CC0 MakeHuman base. Blender 4.5."""
import bpy,bmesh,math,json,sys,os,numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]/'Assets/Kairos'
bpy.ops.wm.open_mainfile(filepath=str(ROOT.parents[2]/'output/kairos/KairosBase.blend'))
rig=bpy.data.objects['KairosRig'];body=bpy.data.objects['Body']
for o in list(bpy.data.objects):
 if o.type=='MESH' and 'short01' in o.name:bpy.data.objects.remove(o,do_unlink=True)
eyes=next((o for o in bpy.data.objects if o.type=='MESH' and 'low-poly' in o.name),None)
if eyes:eyes.name='Eyes'
def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
# Add definition to the connected skin, never separate floating muscle lumps.
for v in body.data.vertices:
 p=v.co;x=abs(p.x);z=p.z
 def g(a,w):return math.exp(-(a/w)**2)
 front=.5-.5*math.tanh(p.y/.05);back=1-front
 if x<.43 and 1.12<z<1.98:
  abdominal=sum(g(z-row,.042) for row in [1.31,1.42,1.53])*g(x-.077,.072)
  p.y-=front*(.027*abdominal+.065*g(x-.155,.115)*g(z-1.765,.085))
  p.y+=front*(.022*g(z-1.655,.019)*g(x-.16,.13)+.012*g(x,.018)*g(z-1.76,.11))
  p.x*=1+.10*g(z-1.30,.18)
  p.y+=front*.008*g(x,.016)*g(z-1.45,.20)
  p.y+=back*(.05*g(x-.14,.105)*g(z-1.84,.11)+.045*g(x-.24,.12)*g(z-1.66,.15)-.023*g(x,.023)*g(z-1.72,.25)-.014*g(z-(1.77+.45*x),.021)*g(x-.18,.15))
# Garments inherit the body's normalized joint weights.
def shell(name,keep,offset=.012):
 o=body.copy();o.data=body.data.copy();bpy.context.collection.objects.link(o);o.name=name
 bm=bmesh.new();bm.from_mesh(o.data)
 bpy.ops.object.select_all(action='DESELECT')
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if not keep(f.calc_center_median())],context='FACES')
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 for v in bm.verts:v.co+=v.normal*offset
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 return o
pants=shell('CargoShorts',lambda p:.66<p.z<1.28 and abs(p.x)<.5,.021)
for v in pants.data.vertices:
 p=v.co;side=1 if p.x>0 else -1;a=math.atan2(p.y,p.x-side*.18)
 p+=v.normal*(.0035*math.sin(p.z*104+a*3)+.002*math.sin(p.z*69-a*5))
 # Raised cargo pocket panels on the outer thighs.
 panel=math.exp(-((p.z-.92)/.095)**8)*math.exp(-((p.y+.01)/.11)**8)
 if abs(p.x)>.23:p.x+=side*.022*panel
hair=shell('CroppedHair',lambda p:p.z>(2.17 if p.y<-.01 else 2.10),.008)
for v in hair.data.vertices:
 p=v.co;v.co+=v.normal*(.004+.004*math.sin(p.x*218+p.y*47)*math.cos(p.y*239-p.z*67))
boots=shell('CombatBoots',lambda p:p.z<.28,.015)
for v in boots.data.vertices:
 if v.co.z<.055:v.co.z=.018
 if v.co.y<-.06:v.co.y-=.018
 # Leather ankle folds.
 v.co+=v.normal*(.002*math.sin(v.co.z*115+v.co.x*23))
gloves=shell('FingerlessGloves',lambda p:abs(p.x)>.72 and p.z>1.05,.006)
# Restrict glove shell to hand / proximal digits, leave fingertips bare.
bm=bmesh.new();bm.from_mesh(gloves.data);layer=bm.verts.layers.deform.active
remove=[]
for f in bm.faces:
 names=[]
 for v in f.verts:
  if layer:
   names.extend(gloves.vertex_groups[k].name for k,w in v[layer].items() if w>.25)
 if not any('Hand' in n for n in names) or all(any(s in n for s in ['2','3','4']) for n in names):remove.append(f)
bmesh.ops.delete(bm,geom=remove,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(gloves.data);bm.free()
belt=shell('LeatherBelt',lambda p:1.23<p.z<1.285 and abs(p.x)<.45,.038)
# Ragged narrow tears reveal the underlying skin at the thighs.
bm=bmesh.new();bm.from_mesh(pants.data)
cut=[]
for f in bm.faces:
 p=f.calc_center_median()
 if p.y<-.06 and any(((abs(p.x)-.19)/.063)**2+((p.z-z)/.020)**2<1 for z in [.80,.86,.99]):cut.append(f)
bmesh.ops.delete(bm,geom=cut,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
for v in bm.verts:
 if v.is_boundary and .72<v.co.z<1.10:v.co.z+=.003*math.sin(v.co.x*371)
bm.to_mesh(pants.data);bm.free()
for v in belt.data.vertices:v.co.z=1.286 if v.co.z>1.256 else 1.233
# Solid fabric/leather rims and a little subdivision improve the silhouette.
meshes=[body,pants,hair,boots,gloves,belt]+([eyes] if eyes else [])
for o in meshes:
 active(o)
 if o!=body and o!=eyes:
  solid=o.modifiers.new('Garment thickness','SOLIDIFY');solid.thickness=.0025;solid.offset=-1;bpy.ops.object.modifier_apply(modifier=solid.name)
 sub=o.modifiers.new('Surface continuity','SUBSURF');sub.levels=1
 bpy.ops.object.modifier_move_up(modifier=sub.name);bpy.ops.object.modifier_apply(modifier=sub.name)
 for f in o.data.polygons:f.use_smooth=True
# Small utility pockets, buckle and boot laces use the nearest anatomical joint.
def bind(o,bone):
 o.parent=rig;m=o.modifiers.new('Skeleton','ARMATURE');m.object=rig
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');meshes.append(o)
def box(name,c,size,bone,bevel=.008):
 bpy.ops.mesh.primitive_cube_add(size=1,location=c);o=bpy.context.object;o.name=name;o.scale=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 m=o.modifiers.new('Soft stitched edges','BEVEL');m.width=bevel;m.segments=3;bpy.ops.object.modifier_apply(modifier=m.name)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);bind(o,bone);return o
buckle=box('BeltBuckle',(0,-.17,1.265),(.075,.028,.062),'Hips',.007)
for sign in [-1,1]:box('BeltPouch',(.25*sign,-.13,1.20),(.085,.105,.13),'Hips')
for sign,side in [(1,'Left'),(-1,'Right')]:
 foot=rig.data.bones[side+'Foot'];x=foot.head_local.x
 box('BootToe',(x,-.110,.060),(.155,.38,.110),side+'Foot',.025)
 box('BootSole',(x,-.110,.020),(.163,.39,.040),side+'Foot',.012)
 box('CargoPocket',(sign*.255,-.100,.99),(.115,.050,.170),side+'UpLeg',.013)
# Add real stitched-looking lace geometry on the boot fronts.
for sign,side in [(1,'Left'),(-1,'Right')]:
 foot=rig.data.bones.get(side+'Foot')
 x=foot.head_local.x if foot else sign*.18
 for i in range(5):
  z=.115+i*.035
  curve=bpy.data.curves.new('Crossed lace','CURVE');curve.dimensions='3D';curve.bevel_depth=.0025;curve.bevel_resolution=1
  sp=curve.splines.new('POLY');sp.points.add(3)
  for point,co in zip(sp.points,[(x-.035,-.082,z),(x+.035,-.092,z+.018),(x-.035,-.083,z+.024),(x+.035,-.092,z+.042)]):point.co=(*co,1)
  o=bpy.data.objects.new('BootLaces',curve);bpy.context.collection.objects.link(o);active(o);bpy.ops.object.convert(target='MESH');bind(o,side+'Foot')
# Opaque boots replace the feet below their leather uppers.
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_center_median().z<.11],context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(body.data);bm.free()
# UVs stay shared for the baked PBR atlas. Keep the original skin weights.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(62),island_margin=.004);bpy.ops.uv.average_islands_scale();bpy.ops.uv.pack_islands(rotate=True,margin=.005);bpy.ops.object.mode_set(mode='OBJECT')
# Procedural PBR material sources, evaluated on actual surfaces then baked to UVs.
def material(name):
 m=bpy.data.materials.new(name);m.use_nodes=True;ns=m.node_tree.nodes;ls=m.node_tree.links;ns.clear()
 out=ns.new('ShaderNodeOutputMaterial');bs=ns.new('ShaderNodeBsdfPrincipled');ls.new(bs.outputs['BSDF'],out.inputs['Surface'])
 tex=ns.new('ShaderNodeTexCoord');return m,ns,ls,bs,tex
m,ns,ls,bs,tc=material('Kairos_Skin_Source')
bs.inputs['Roughness'].default_value=.58;bs.inputs['Specular IOR Level'].default_value=.32
coarse=ns.new('ShaderNodeTexNoise');coarse.inputs['Scale'].default_value=13;coarse.inputs['Detail'].default_value=4;ls.new(tc.outputs['Object'],coarse.inputs['Vector'])
ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.18;ramp.color_ramp.elements[0].color=(.050,.018,.009,1);ramp.color_ramp.elements[1].position=.83;ramp.color_ramp.elements[1].color=(.095,.042,.022,1);ls.new(coarse.outputs['Fac'],ramp.inputs[0]);ls.new(ramp.outputs['Color'],bs.inputs['Base Color'])
pores=ns.new('ShaderNodeTexNoise');pores.inputs['Scale'].default_value=950;pores.inputs['Detail'].default_value=2;ls.new(tc.outputs['Object'],pores.inputs['Vector'])
bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.25;bump.inputs['Distance'].default_value=.0006;ls.new(pores.outputs['Fac'],bump.inputs['Height'])
# Fine stretched skin variation underneath pores.
wrinkle=ns.new('ShaderNodeTexNoise');wrinkle.inputs['Scale'].default_value=85;wrinkle.inputs['Detail'].default_value=3;ls.new(tc.outputs['Object'],wrinkle.inputs['Vector'])
under=ns.new('ShaderNodeBump');under.inputs['Strength'].default_value=.16;under.inputs['Distance'].default_value=.0015;ls.new(wrinkle.outputs['Fac'],under.inputs['Height']);ls.new(under.outputs['Normal'],bump.inputs['Normal']);ls.new(bump.outputs['Normal'],bs.inputs['Normal'])
rough=ns.new('ShaderNodeMapRange');rough.inputs['From Min'].default_value=0;rough.inputs['From Max'].default_value=1;rough.inputs['To Min'].default_value=.48;rough.inputs['To Max'].default_value=.68;ls.new(wrinkle.outputs['Fac'],rough.inputs['Value']);ls.new(rough.outputs[0],bs.inputs['Roughness'])
# Sparse vein relief on limbs and a subtle upper-chest scar.
def mathnode(op,*args):
 n=ns.new('ShaderNodeMath');n.operation=op
 for i,a in enumerate(args):
  if isinstance(a,(float,int)):n.inputs[i].default_value=a
  else:ls.new(a,n.inputs[i])
 return n.outputs[0]
sep=ns.new('ShaderNodeSeparateXYZ');ls.new(tc.outputs['Object'],sep.inputs[0])
limb=mathnode('GREATER_THAN',mathnode('ABSOLUTE',sep.outputs['X']),.42)
vor=ns.new('ShaderNodeTexVoronoi');vor.feature='DISTANCE_TO_EDGE';vor.inputs['Scale'].default_value=19;ls.new(tc.outputs['Object'],vor.inputs['Vector'])
vein=mathnode('MULTIPLY',mathnode('MAXIMUM',mathnode('SUBTRACT',.018,vor.outputs['Distance']),0),limb)
veinb=ns.new('ShaderNodeBump');veinb.inputs['Strength'].default_value=.24;veinb.inputs['Distance'].default_value=.014;ls.new(vein,veinb.inputs['Height']);ls.new(bump.outputs['Normal'],veinb.inputs['Normal']);ls.new(veinb.outputs['Normal'],bs.inputs['Normal'])
scarx=mathnode('MULTIPLY',mathnode('SUBTRACT',sep.outputs['X'],.19),100)
scary=mathnode('MULTIPLY',mathnode('ADD',sep.outputs['Y'],.20),18)
scarz=mathnode('MULTIPLY',mathnode('SUBTRACT',sep.outputs['Z'],1.79),14)
scar=mathnode('MAXIMUM',mathnode('SUBTRACT',1,mathnode('ADD',mathnode('ADD',mathnode('MULTIPLY',scarx,scarx),mathnode('MULTIPLY',scary,scary)),mathnode('MULTIPLY',scarz,scarz))),0)
scarb=ns.new('ShaderNodeBump');scarb.inputs['Strength'].default_value=.3;scarb.inputs['Distance'].default_value=.0008;ls.new(scar,scarb.inputs['Height']);ls.new(veinb.outputs['Normal'],scarb.inputs['Normal']);ls.new(scarb.outputs['Normal'],bs.inputs['Normal'])
# Use the supplied design sheet on central torso surfaces, blended with the
# authored skin material. Limbs retain their own material rather than projecting background.
reference=os.environ.get('KAIROS_REFERENCE')
if reference and Path(reference).exists():
 photo=bpy.data.images.load(reference,check_existing=True)
 def projected(cx,sign):
  combine=ns.new('ShaderNodeCombineXYZ')
  ls.new(mathnode('ADD',cx/1310,mathnode('MULTIPLY',sep.outputs['X'],sign*285/1310)),combine.inputs['X'])
  ls.new(mathnode('ADD',13/736,mathnode('MULTIPLY',sep.outputs['Z'],304/736)),combine.inputs['Y'])
  im=ns.new('ShaderNodeTexImage');im.image=photo;ls.new(combine.outputs[0],im.inputs['Vector']);return im.outputs['Color']
 blend=ns.new('ShaderNodeMixRGB');ls.new(mathnode('GREATER_THAN',sep.outputs['Y'],0),blend.inputs[0]);ls.new(projected(242,1),blend.inputs[1]);ls.new(projected(1094,-1),blend.inputs[2])
 def saturate(value):return mathnode('MINIMUM',mathnode('MAXIMUM',value,0),1)
 low=saturate(mathnode('MULTIPLY',mathnode('SUBTRACT',sep.outputs['Z'],1.36),12.5))
 high=saturate(mathnode('MULTIPLY',mathnode('SUBTRACT',1.92,sep.outputs['Z']),12.5))
 zmask=mathnode('MULTIPLY',low,high)
 xmask=saturate(mathnode('MULTIPLY',mathnode('SUBTRACT',.265,mathnode('ABSOLUTE',sep.outputs['X'])),13.33))
 mask=mathnode('MULTIPLY',mathnode('MULTIPLY',zmask,xmask),.68)
 mix=ns.new('ShaderNodeMixRGB');ls.new(mask,mix.inputs[0]);ls.new(ramp.outputs['Color'],mix.inputs[1]);ls.new(blend.outputs[0],mix.inputs[2]);ls.new(mix.outputs[0],bs.inputs['Base Color'])
body.data.materials.clear();body.data.materials.append(m)
m,ns,ls,bs,tc=material('Kairos_Cloth_Source');bs.inputs['Roughness'].default_value=.89
noise=ns.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=32;noise.inputs['Detail'].default_value=4;ls.new(tc.outputs['Object'],noise.inputs['Vector'])
ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.038,.045,.029,1);ramp.color_ramp.elements[1].color=(.067,.076,.052,1);ls.new(noise.outputs['Fac'],ramp.inputs[0]);ls.new(ramp.outputs[0],bs.inputs['Base Color'])
weave=ns.new('ShaderNodeTexNoise');weave.inputs['Scale'].default_value=1200;weave.inputs['Detail'].default_value=1;ls.new(tc.outputs['Object'],weave.inputs['Vector'])
b=ns.new('ShaderNodeBump');b.inputs['Strength'].default_value=.35;b.inputs['Distance'].default_value=.0008;ls.new(weave.outputs['Fac'],b.inputs['Height']);ls.new(b.outputs['Normal'],bs.inputs['Normal'])
sep=ns.new('ShaderNodeSeparateXYZ');ls.new(tc.outputs['Object'],sep.inputs[0])
side=mathnode('MULTIPLY',mathnode('LESS_THAN',mathnode('ABSOLUTE',sep.outputs['Y']),.0025),mathnode('GREATER_THAN',mathnode('ABSOLUTE',sep.outputs['X']),.29))
stitch=mathnode('MULTIPLY',side,mathnode('GREATER_THAN',mathnode('SINE',mathnode('MULTIPLY',sep.outputs['Z'],520)),.1))
seamb=ns.new('ShaderNodeBump');seamb.inputs['Strength'].default_value=.4;seamb.inputs['Distance'].default_value=.001;ls.new(stitch,seamb.inputs['Height']);ls.new(b.outputs['Normal'],seamb.inputs['Normal']);ls.new(seamb.outputs['Normal'],bs.inputs['Normal'])
pants.data.materials.clear();pants.data.materials.append(m)
if hair:
 m,ns,ls,bs,tc=material('Kairos_Hair_Source');bs.inputs['Base Color'].default_value=(.002,.0015,.001,1);bs.inputs['Roughness'].default_value=.76
 strand=ns.new('ShaderNodeTexWave');strand.wave_type='BANDS';strand.bands_direction='X';strand.inputs['Scale'].default_value=260;strand.inputs['Distortion'].default_value=9;strand.inputs['Detail'].default_value=4;ls.new(tc.outputs['Object'],strand.inputs['Vector'])
 hb=ns.new('ShaderNodeBump');hb.inputs['Strength'].default_value=.65;hb.inputs['Distance'].default_value=.0018;ls.new(strand.outputs['Color'],hb.inputs['Height']);ls.new(hb.outputs['Normal'],bs.inputs['Normal'])
 hair.data.materials.clear();hair.data.materials.append(m)
if eyes:
 m,ns,ls,bs,tc=material('Kairos_Eyes_Source');bs.inputs['Base Color'].default_value=(.17,.15,.075,1);bs.inputs['Roughness'].default_value=.24
 sep=ns.new('ShaderNodeSeparateXYZ');ls.new(tc.outputs['Object'],sep.inputs[0])
 eyeX=sum(abs(v.co.x) for v in eyes.data.vertices)/len(eyes.data.vertices);eyeZ=sum(v.co.z for v in eyes.data.vertices)/len(eyes.data.vertices)
 dx=mathnode('SUBTRACT',mathnode('ABSOLUTE',sep.outputs['X']),eyeX);dz=mathnode('SUBTRACT',sep.outputs['Z'],eyeZ)
 radius=mathnode('ADD',mathnode('MULTIPLY',dx,dx),mathnode('MULTIPLY',dz,dz))
 iris=ns.new('ShaderNodeMixRGB');iris.inputs[1].default_value=(.34,.36,.30,1);iris.inputs[2].default_value=(.075,.095,.028,1);ls.new(mathnode('LESS_THAN',radius,.000048),iris.inputs[0])
 pupil=ns.new('ShaderNodeMixRGB');ls.new(iris.outputs[0],pupil.inputs[1]);pupil.inputs[2].default_value=(.001,.002,.001,1);ls.new(mathnode('LESS_THAN',radius,.000006),pupil.inputs[0]);ls.new(pupil.outputs[0],bs.inputs['Base Color'])
 eyes.data.materials.clear();eyes.data.materials.append(m)

for o in meshes:
 if o in (body,pants,hair,eyes):continue
 m,ns,ls,bs,tc=material(o.name+' surface')
 ismetal=o==buckle
 bs.inputs['Base Color'].default_value=(.12,.105,.07,1) if ismetal else (.035,.022,.012,1) if o==boots or o==belt or o.name.startswith(('BeltPouch','BootToe')) else (.04,.047,.03,1) if o.name.startswith('CargoPocket') else (.014,.016,.012,1)
 bs.inputs['Roughness'].default_value=.42 if ismetal else .72
 bs.inputs['Metallic'].default_value=.75 if ismetal else 0
 n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=420;ls.new(tc.outputs['Object'],n.inputs['Vector'])
 b=ns.new('ShaderNodeBump');b.inputs['Strength'].default_value=.2;b.inputs['Distance'].default_value=.0005;ls.new(n.outputs['Fac'],b.inputs['Height']);ls.new(b.outputs['Normal'],bs.inputs['Normal'])
 o.data.materials.clear();o.data.materials.append(m)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.bake.margin=12;scene.render.bake.use_clear=False
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
sources=list(set(o.data.materials[0] for o in meshes));images={}
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=body
for label,kind,color in [('BaseColor','DIFFUSE',True),('Normal','NORMAL',False),('Roughness','ROUGHNESS',False),('AO','AO',False)]:
 im=bpy.data.images.new('Kairos_'+label,2048,2048,alpha=False,float_buffer=False);im.colorspace_settings.name='sRGB' if color else 'Non-Color';images[label]=im
 for m in sources:
  node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;m.node_tree.nodes.active=node
 print('BAKING',label,flush=True);bpy.ops.object.bake(type=kind)
 im.filepath_raw=str(ROOT/'Textures'/('Kairos_'+label+'.png'));im.file_format='PNG';im.save()
# Metallic is zero (skin/fabric); Unity Standard stores smoothness in alpha.
rough=np.empty(2048*2048*4,np.float32);images['Roughness'].pixels.foreach_get(rough);rough=rough.reshape(-1,4)
for label,packed in [('Metallic',False),('MetallicSmoothness',True)]:
 im=bpy.data.images.new('Kairos_'+label,2048,2048,alpha=True);im.colorspace_settings.name='Non-Color'
 a=np.zeros((2048*2048,4),np.float32);a[:,3]=1-rough[:,0] if packed else 1
 im.pixels.foreach_set(a.ravel());im.filepath_raw=str(ROOT/'Textures'/('Kairos_'+label+'.png'));im.file_format='PNG';im.save();images[label]=im
# Attach the real baked maps to the preview/export material.
m,ns,ls,bs,tc=material('Kairos_PBR');bs.inputs['Roughness'].default_value=.7;bs.inputs['Specular IOR Level'].default_value=.28
for label,socket in [('BaseColor','Base Color'),('Roughness','Roughness')]:
 t=ns.new('ShaderNodeTexImage');t.image=images[label];ls.new(t.outputs['Color'],bs.inputs[socket])
t=ns.new('ShaderNodeTexImage');t.image=images['Normal'];normal=ns.new('ShaderNodeNormalMap');ls.new(t.outputs['Color'],normal.inputs['Color']);ls.new(normal.outputs['Normal'],bs.inputs['Normal'])
for o in meshes:o.data.materials.clear();o.data.materials.append(m)
# Four influences maximum, weights normalized, fixed rest skeleton for every LOD.
for o in meshes:
 active(o);bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)

for o in meshes:
 active(o)
 count=sum(len(p.vertices)-2 for p in o.data.polygons)
 budget=55000 if o==body else 6500 if o in (boots,gloves) else 5500 if o==pants else 2500 if o==hair else count
 if count>budget:
  dec=o.modifiers.new('Game mesh budget','DECIMATE');dec.ratio=budget/count;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
# Rig and mesh remain separate from the animation source, so existing game clips are preserved.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.fbx(filepath=str(ROOT/'Models/Kairos.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',apply_unit_scale=True,apply_scale_options='FBX_SCALE_UNITS',use_tspace=True,path_mode='RELATIVE')
preview=ROOT.parents[2]/'output/kairos';preview.mkdir(parents=True,exist_ok=True)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,loc,energy in [('Key',(3,-4,4),650),('Fill',(-3,-1,3),300),('Rim',(0,3,3.5),500)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=energy;o.data.size=4;aim(o,(0,0,1.2))
bpy.ops.object.camera_add(location=(0,-5,1.4));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.65
scene.world.color=(.18,.18,.18);scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=900;scene.render.resolution_y=1050;scene.render.resolution_percentage=100
for name,loc in [('front',(0,-5,1.45)),('back',(0,5,1.45))]:
 cam.location=loc;aim(cam,(0,0,1.17));scene.render.filepath=str(preview/('blender_'+name+'.png'));bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview/'Kairos_editable.blend'))
print('KAIROS_EXPORT_READY',[(o.name,len(o.data.vertices)) for o in meshes],flush=True)
