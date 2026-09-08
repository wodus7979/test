"""Bake technical PBR maps from AI base colors and update the existing city geometry.
Requires Python 3, NumPy and Pillow. Original image pixels are retained in Sources.
"""
from pathlib import Path
import json, math, struct, shutil, argparse
import numpy as np
from PIL import Image, ImageFilter

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=HERE.parent)
args=parser.parse_args(); ROOT=args.root.resolve()
SRC=ROOT/'Unity/Assets/KoreanCityPackTextured/Source'; TEX=ROOT/'Textures/PBR'
ORIG=ROOT/'Textures/Sources'; ORIG.mkdir(exist_ok=True,parents=True)
SETUP=json.loads((HERE/'material_setup.json').read_text())
SETUP['brick']['scale']=[1.04,.84]
SETUP['pavers']['scale']=[1.72,1.8]
TEX.mkdir(exist_ok=True,parents=True)
def save(a,path):
 Image.fromarray(np.uint8(np.clip(a,0,1)*255+.5)).save(path)
roughs={};report={}
for name,s in SETUP.items():
 source=ORIG/(name+'.png')
 if not source.exists():raise FileNotFoundError('Missing generated texture source: '+str(source))
 im=Image.open(source).convert('RGB');native=list(im.size)
 im=im.resize((1024,1024),Image.Resampling.LANCZOS)
 im.save(TEX/(name+'_albedo.jpg'),quality=96,subsampling=0)
 rgb=np.asarray(im,dtype=np.float32)/255
 lum=rgb@np.array([.2126,.7152,.0722])
 # Conservative luminance/chroma proxy, not measured surface height.
 if name=='brick': height=np.clip((rgb[:,:,0]-rgb[:,:,2])*.9+lum*.4,0,1)
 else:height=lum
 smooth=np.asarray(Image.fromarray(np.uint8(height*255)).filter(ImageFilter.GaussianBlur(.65)),dtype=np.float32)/255
 du=(np.roll(smooth,-1,1)-np.roll(smooth,1,1))*.5
 dv=(np.roll(smooth,-1,0)-np.roll(smooth,1,0))*.5
 strength=s['height_strength']*24
 normal=np.stack([-du*strength,-dv*strength,np.ones_like(du)],axis=2)
 normal/=np.linalg.norm(normal,axis=2,keepdims=True)
 save(normal*.5+.5,TEX/(name+'_normal_gltf.png'))
 # Unity flips source UV V at mesh import, so invert the bitangent channel.
 normal[:,:,1]*=-1
 save(normal*.5+.5,TEX/(name+'_normal_unity.png'))
 rough=np.clip(s['roughness']+(lum.mean()-lum)*.24,.2,.99);roughs[name]=rough
 save(rough,TEX/(name+'_roughness.png'))
 orm=np.stack([np.ones_like(rough),rough,np.ones_like(rough)],axis=2)
 save(orm,TEX/(name+'_orm.png'))
 edge=float((np.abs(rgb[:,0]-rgb[:,-1]).mean()+np.abs(rgb[0]-rgb[-1]).mean())/2)
 interior=float((np.abs(np.diff(rgb,axis=0)).mean()+np.abs(np.diff(rgb,axis=1)).mean())/2)
 report[name]={'source_size':native,'map_size':[1024,1024],'tile_meters':s['scale'],'edge_mean_difference':round(edge,5),'adjacent_pixel_mean_difference':round(interior,5),'seamless_guaranteed':False,'roughness_range':[round(float(rough.min()),3),round(float(rough.max()),3)]}

materials=json.loads((SRC/'materials.json').read_text())['materials']
by_mat={i:name for name,s in SETUP.items() for i in s['materials']}
# Multipliers are linear, applied to sRGB-decoded photographic base color.
tints={0:[.85,.86,.84],1:[1,.96,.84],2:[1,1,1],3:[1,1,1],6:[.13,.16,.17],7:[.25,.38,.46],8:[.065,.30,.53],9:[.80,.83,.85],12:[1,1,1],13:[.63,.72,.75],20:[.86,.94,1],21:[1,1,.96],22:[.84,.82,.75]}
for i,mat in enumerate(materials):
 if i not in by_mat:continue
 name=by_mat[i];rough=roughs[name];mat['color']=tints[i];mat['surface']=name
 mat['roughness']=float(rough.mean());mat['albedo']='Textures/PBR/'+name+'_albedo.jpg'
 mat['normal']='Textures/PBR/'+name+'_normal_unity.png'
 mat['orm']='Textures/PBR/'+name+'_orm.png'
 mat['normalGltf']='Textures/PBR/'+name+'_normal_gltf.png'
 metal=np.full_like(rough,mat['metallic']);smooth=1-rough
 packed=np.stack([metal,np.ones_like(rough),np.zeros_like(rough),smooth],axis=2)
 filename=mat['name']+'_metallic_smoothness.png';save(packed,TEX/filename)
 mat['metallicSmoothness']='Textures/PBR/'+filename
 # HDRP B=detail mask: one permits a future detail map; no detail map is assigned.
 packed[:,:,2]=1;filename=mat['name']+'_hdrp_mask.png';save(packed,TEX/filename)
 mat['maskMap']='Textures/PBR/'+filename
(SRC/'materials.json').write_text(json.dumps({'materials':materials},indent=2))

models={}
for f in sorted(SRC.glob('*.json')):
 if f.stem in ('materials','layout'):continue
 m=json.loads(f.read_text());models[m['name']]=m
 for part in m['parts']:
  if part['mat'] not in by_mat:continue
  tile=SETUP[by_mat[part['mat']]]['scale']
  p=np.array(part['p']).reshape(-1,3);n=np.array(part['n']).reshape(-1,3);uv=np.zeros((len(p),2))
  for k in range(0,len(p),3):
   axis=np.argmax(np.abs(n[k:k+3].mean(axis=0)));v=p[k:k+3]
   if axis==1:uv[k:k+3]=np.column_stack([v[:,0]/tile[0],v[:,2]/tile[1]])
   elif axis==2:uv[k:k+3]=np.column_stack([v[:,0]/tile[0],-v[:,1]/tile[1]])
   else:uv[k:k+3]=np.column_stack([v[:,2]/tile[0],-v[:,1]/tile[1]])
  part['uv']=np.round(uv.flatten(),6).tolist()
 f.write_text(json.dumps(m,ensure_ascii=False,separators=(',',':')))

# Existing GLBs already contain the validated geometry. Replace UV streams and
# material declarations, append texture data; positions/normals/instances stay exact.
def update_glb(path,embed):
 raw=path.read_bytes();jlen=struct.unpack_from('<I',raw,12)[0]
 doc=json.loads(raw[20:20+jlen]);blen=struct.unpack_from('<I',raw,20+jlen)[0]
 binary=bytearray(raw[28+jlen:28+jlen+blen])
 for mesh in doc['meshes']:
  model=models[mesh['name']]
  for primitive,part in zip(mesh['primitives'],model['parts']):
   a=doc['accessors'][primitive['attributes']['TEXCOORD_0']];v=doc['bufferViews'][a['bufferView']]
   offset=v.get('byteOffset',0)+a.get('byteOffset',0)
   data=np.array(part['uv'],dtype='<f4').tobytes();assert len(data)==a['count']*8
   binary[offset:offset+len(data)]=data
 # Compact old binary image payloads out, making repeated exports deterministic.
 compact=bytearray();views=[];remap={}
 for accessor in doc['accessors']:
  old_index=accessor['bufferView']
  if old_index not in remap:
   view=dict(doc['bufferViews'][old_index]);start=view.get('byteOffset',0)
   compact.extend(b'\0'*(-len(compact)%4));view['byteOffset']=len(compact)
   compact.extend(binary[start:start+view['byteLength']]);remap[old_index]=len(views);views.append(view)
  accessor['bufferView']=remap[old_index]
 binary=compact;doc['bufferViews']=views
 used={p['material'] for mesh in doc['meshes'] for p in mesh['primitives']}
 doc['images']=[];doc['textures']=[];doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497},{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]
 cache={}
 def texture(rel,atlas=False):
  if rel in cache:return cache[rel]
  source=ROOT/rel
  if embed:
   binary.extend(b'\0'*(-len(binary)%4));vi=len(doc['bufferViews']);data=source.read_bytes()
   doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data)
   image={'bufferView':vi,'mimeType':'image/jpeg' if source.suffix=='.jpg' else 'image/png','name':source.stem}
  else:image={'uri':'../'+rel,'name':source.stem}
  ti=len(doc['textures']);doc['images'].append(image);doc['textures'].append({'source':ti,'sampler':1 if atlas else 0});cache[rel]=ti;return ti
 doc['materials']=[]
 for i,mat in enumerate(materials):
  pbr={'baseColorFactor':mat['color']+[1],'metallicFactor':mat['metallic'],'roughnessFactor':mat['roughness']}
  d={'name':mat['name'],'pbrMetallicRoughness':pbr}
  if i in used and mat.get('albedo'):
   pbr['baseColorTexture']={'index':texture(mat['albedo'])}
   pbr['metallicRoughnessTexture']={'index':texture(mat['orm'])};pbr['roughnessFactor']=1
   d['normalTexture']={'index':texture(mat['normalGltf']),'scale':1}
  elif i in used and mat.get('atlas'):pbr['baseColorTexture']={'index':texture('Textures/sign_atlas.png',True)}
  doc['materials'].append(d)
 doc['asset']['generator']='Korean City Textured v2 — AI base colors and estimated PBR maps'
 doc['buffers']=[{'byteLength':len(binary)}]
 j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*(-len(j)%4);binary.extend(b'\0'*(-len(binary)%4))
 path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)
for path in sorted((ROOT/'Models').glob('*.glb')):update_glb(path,False)
update_glb(ROOT/'korean_city_layout.glb',True)
# OBJ has identical vertex order, allowing a UV-only update.
for name,m in models.items():
 path=ROOT/'Models'/(name+'.obj');uv=iter([x for p in m['parts'] for x in np.array(p['uv']).reshape(-1,2)])
 lines=[]
 for line in path.read_text().splitlines():
  if line.startswith('vt '):u,v=next(uv);line=f'vt {u:.6f} {1-v:.6f}'
  lines.append(line)
 path.write_text('\n'.join(lines))
mtl=[]
for mat in materials:
 mtl+=['newmtl '+mat['name'],'Kd '+' '.join(str(x) for x in mat['color']),f'Pm {mat["metallic"]}',f'Pr {mat["roughness"]}']
 if mat.get('albedo'):mtl+=['map_Kd ../'+mat['albedo'],'norm ../'+mat['normal'],'map_Pr ../Textures/PBR/'+mat['surface']+'_roughness.png']
 elif mat.get('atlas'):mtl+=['map_Kd ../Textures/sign_atlas.png']
(ROOT/'Models/city_materials.mtl').write_text('\n'.join(mtl))
shutil.copytree(TEX,ROOT/'Unity/Assets/KoreanCityPackTextured/Textures/PBR',dirs_exist_ok=True)
(ROOT/'texture_report.json').write_text(json.dumps(report,indent=2))
(ROOT/'texture_prompts.json').write_text((HERE/'prompts.json').read_text())
print(json.dumps({'surfaces':len(SETUP),'textured_materials':len(by_mat),'models':len(models),'map_files':len(list(TEX.iterdir())),'report':report},indent=2))
