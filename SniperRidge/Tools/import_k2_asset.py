"""Convert the user-provided K2 GLB zip into Sniper Ridge's package-free Unity source format."""
from pathlib import Path
from io import BytesIO
import hashlib,json,math,struct,sys,zipfile
from PIL import Image,ImageOps

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'Assets/TankAssetPack/Source'
TEXTURES=ROOT/'Assets/TankAssetPack/Textures/K2'
FORMATS={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
COMPONENTS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}

def chunks(blob):
    magic,version,total=struct.unpack_from('<III',blob,0)
    assert magic==0x46546C67 and version==2 and total==len(blob)
    offset=12;result={}
    while offset<len(blob):
        length,kind=struct.unpack_from('<II',blob,offset);offset+=8
        result[kind]=blob[offset:offset+length];offset+=length
    return result

def accessor(doc,binary,index):
    info=doc['accessors'][index];view=doc['bufferViews'][info['bufferView']]
    count=info['count'];n=COMPONENTS[info['type']];code=FORMATS[info['componentType']]
    size=struct.calcsize('<'+code)*n;stride=view.get('byteStride',size)
    start=view.get('byteOffset',0)+info.get('byteOffset',0);fmt='<'+code*n
    return [struct.unpack_from(fmt,binary,start+i*stride) for i in range(count)]

def source_vector(v):
    # K2: +X forward, +Y up, +Z right. Builder source: +X right, +Y up, -Z forward.
    return [round(float(v[2]),6),round(float(v[1]),6),round(float(-v[0]),6)]

def subtract(a,b):
    return tuple(x-y for x,y in zip(a,b))

def cross(a,b):
    return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])

def mesh_parts(doc,binary,component,node_names):
    parts=[];triangles=0
    for node in doc['nodes']:
        if node.get('name') not in node_names or 'mesh' not in node:continue
        mesh=doc['meshes'][node['mesh']]
        for ordinal,primitive in enumerate(mesh['primitives']):
            assert primitive.get('mode',4)==4 and 'indices' in primitive and 'POSITION' in primitive['attributes']
            positions=accessor(doc,binary,primitive['attributes']['POSITION'])
            uvs=accessor(doc,binary,primitive['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in primitive['attributes'] else [(0.,0.)]*len(positions)
            indices=[int(x[0]) for x in accessor(doc,binary,primitive['indices'])]
            assert len(indices)%3==0
            p=[];n=[];uv=[]
            for i in range(0,len(indices),3):
                # TankPackBuilder mirrors source Z once more on import. Reverse B/C here and
                # keep normals opposite in source space so Unity's final winding and normals agree.
                ids=(indices[i],indices[i+2],indices[i+1])
                a,b,c=(positions[k] for k in ids)
                normal=cross(subtract(b,a),subtract(c,a));length=math.sqrt(sum(x*x for x in normal))
                if length<1e-10:continue
                normal=tuple(x/length for x in normal)
                for k in ids:
                    p.extend(source_vector(positions[k]));n.extend(source_vector(tuple(-x for x in normal)));uv.extend(round(float(x),6) for x in uvs[k])
                triangles+=1
            parts.append({'name':mesh.get('name',component)+'_'+str(ordinal),'mat':primitive.get('material',0),'p':p,'n':n,'uv':uv})
    assert parts,component
    return parts,triangles

def image_bytes(doc,binary,index):
    image=doc['images'][doc['textures'][index]['source']];view=doc['bufferViews'][image['bufferView']]
    start=view.get('byteOffset',0);return binary[start:start+view['byteLength']]

def load_image(png_bytes):
    image=Image.open(BytesIO(png_bytes)).convert('RGB')
    if max(image.size)>2048:image.thumbnail((2048,2048),Image.Resampling.LANCZOS)
    return image

def unity_maps(png_bytes,stem):
    image=load_image(png_bytes);red,green,blue=image.split();smooth=ImageOps.invert(green);zero=Image.new('L',image.size,0);white=Image.new('L',image.size,255)
    packed=Image.merge('RGBA',(blue,zero,zero,smooth));mask=Image.merge('RGBA',(blue,white,zero,smooth))
    ms=TEXTURES/(stem+'_metallic_smoothness.png');hm=TEXTURES/(stem+'_hdrp_mask.png')
    packed.save(ms);mask.save(hm)
    return 'Textures/K2/'+ms.name,'Textures/K2/'+hm.name

def main():
    archive=Path(sys.argv[1] if len(sys.argv)>1 else Path.home()/'Downloads/k2_black_panther_3d_asset.zip')
    assert archive.is_file(),archive
    with zipfile.ZipFile(archive) as z:
        name=next(n for n in z.namelist() if n.endswith('/assets/k2_black_panther.glb'))
        blob=z.read(name)
    data=chunks(blob);doc=json.loads(data[0x4E4F534A].decode().rstrip('\0 '));binary=data[0x004E4942]
    SOURCE.mkdir(parents=True,exist_ok=True);TEXTURES.mkdir(parents=True,exist_ok=True)
    nodes={x.get('name'):x for x in doc['nodes']}
    components=[];total_triangles=0
    spec=[('Hull','',{'Hull_camo','Hull_rubber','Hull_metal','Hull_glass','Hull_dark'}),
          ('Turret','',{'Turret_camo','Turret_glass','Turret_dark'}),
          ('Barrel','Turret',{'Gun_camo','Gun_dark'})]
    for name,parent,children in spec:
        source_node=nodes['Gun' if name=='Barrel' else name]
        matrix=source_node.get('matrix',[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
        position=source_vector(matrix[12:15])
        parts,count=mesh_parts(doc,binary,name,children);total_triangles+=count
        if name=='Hull':colliders=[
            {'center':[0,.98,0],'size':[2.5,1.25,7.5]},
            {'center':[-1.49,.55,0],'size':[.64,1.05,7.4]},
            {'center':[1.49,.55,0],'size':[.64,1.05,7.4]}]
        elif name=='Turret':colliders=[{'center':[0,.48,.35],'size':[3.0,1.15,4.9]}]
        else:colliders=[]
        components.append({'name':name,'parent':parent,'position':position,
            'lods':[{'parts':parts},{'parts':parts}],'colliders':colliders})
    model={'name':'k2_black_panther','label':'K2 흑표 주력전차','components':components,'markers':[
        {'name':'Muzzle','parent':'Barrel','position':[0,0,-5.65]},
        {'name':'DriverView','parent':'Hull','position':[0,2.0,-1.6]},
        {'name':'TurretView','parent':'Turret','position':[0,1.2,0]}]}
    (SOURCE/'k2_black_panther.json').write_text(json.dumps(model,separators=(',',':')))
    material_rows=[]
    names=['k2_camo','k2_rubber','k2_metal']
    for index,material in enumerate(doc['materials']):
        pbr=material.get('pbrMetallicRoughness',{});base=pbr.get('baseColorTexture',{}).get('index')
        mr=pbr.get('metallicRoughnessTexture',{}).get('index');normal=material.get('normalTexture',{}).get('index')
        row={'name':material['name'],'color':pbr.get('baseColorFactor',[1,1,1,1])[:3],
             'metallic':pbr.get('metallicFactor',0),'roughness':pbr.get('roughnessFactor',1),'doubleSided':material.get('doubleSided',False),
             'albedo':'','normal':'','metallicSmoothness':'','maskMap':''}
        if base is not None:
            stem=names[index];path=TEXTURES/(stem+'_albedo.png');load_image(image_bytes(doc,binary,base)).save(path,optimize=True);row['albedo']='Textures/K2/'+path.name
        if normal is not None:
            image=load_image(image_bytes(doc,binary,normal));red,green,blue=image.split();image=Image.merge('RGB',(red,ImageOps.invert(green),blue))
            path=TEXTURES/(names[index]+'_normal_unity.png');image.save(path,optimize=True);row['normal']='Textures/K2/'+path.name
        if mr is not None:row['metallicSmoothness'],row['maskMap']=unity_maps(image_bytes(doc,binary,mr),names[index])
        material_rows.append(row)
    (SOURCE/'k2_materials.json').write_text(json.dumps({'materials':material_rows},separators=(',',':')))
    manifest={'sourceArchive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
              'triangles':total_triangles,'components':['Hull','Turret','Barrel'],'textures':sorted(x.name for x in TEXTURES.iterdir())}
    (SOURCE/'k2_import_manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False))
    print(f'K2 import complete: {total_triangles:,} triangles, {len(material_rows)} materials, {len(manifest["textures"])} textures')

if __name__=='__main__':main()
