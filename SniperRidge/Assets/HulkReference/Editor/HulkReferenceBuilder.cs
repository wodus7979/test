using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
namespace HulkReferenceAssets
{
 public static class HulkReferenceBuilder
 {
  const string Root="Assets/HulkReference";
  [Serializable] public class Bone { public string name,parent; public float[] position,world; }
  [Serializable] public class Part { public string name; public int mat; public float[] p,n,uv,w; public int[] j; }
  [Serializable] public class Level { public Part[] parts; }
  [Serializable] public class Clip { public string name; public bool loop; public float duration; public float[] times,hipsPositions; public RotationTrack[] tracks; }
  [Serializable] public class RotationTrack { public float[] values; }
  [Serializable] public class Character { public string name; public Bone[] bones; public Level[] lods; public Clip[] clips; }
  [Serializable] public class Mat { public string name,albedo,normal; public float[] color; public float metallic,roughness; }
  [Serializable] public class Mats { public Mat[] materials; }
  static void Save(UnityEngine.Object asset,string path)
  {
   var existing=AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(path);
   if(existing!=null){EditorUtility.CopySerialized(asset,existing);UnityEngine.Object.DestroyImmediate(asset);}
   else AssetDatabase.CreateAsset(asset,path);
  }
  static string ReadSource()
  {
   using(var file=File.OpenRead(Root+"/Source/character.json.gz.bytes"))
   using(var gzip=new GZipStream(file,CompressionMode.Decompress))
   using(var reader=new StreamReader(gzip))return reader.ReadToEnd();
  }
  static Vector3 V(float[] v,int i=0){return new Vector3(v[i],v[i+1],-v[i+2]);}
  static void Folder(string p){if(AssetDatabase.IsValidFolder(p))return;string parent=Path.GetDirectoryName(p).Replace('\\','/');Folder(parent);AssetDatabase.CreateFolder(parent,Path.GetFileName(p));}
  static Texture2D Texture(string rel,bool normal)
  {
   if(string.IsNullOrEmpty(rel))return null;string path=Root+"/"+rel;var imp=AssetImporter.GetAtPath(path) as TextureImporter;
   if(imp==null)throw new FileNotFoundException(path);imp.textureType=normal?TextureImporterType.NormalMap:TextureImporterType.Default;imp.convertToNormalmap=false;imp.sRGBTexture=!normal;imp.maxTextureSize=2048;imp.mipmapEnabled=true;imp.wrapMode=TextureWrapMode.Repeat;imp.SaveAndReimport();return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
  }
  static Material[] Materials(string output)
  {
   var info=JsonUtility.FromJson<Mats>(File.ReadAllText(Root+"/Source/materials.json"));var pipeline=GraphicsSettings.currentRenderPipeline;string shaderName=pipeline==null?"Standard":pipeline.GetType().Name.Contains("HDRender")?"HDRP/Lit":"Universal Render Pipeline/Lit";var shader=Shader.Find(shaderName);if(shader==null)throw new Exception("Missing shader: "+shaderName);
   var result=new Material[info.materials.Length];
   for(int i=0;i<result.Length;i++)
   {
    var d=info.materials[i];var m=new Material(shader){name=d.name};Color color=new Color(d.color[0],d.color[1],d.color[2]).gamma;color.a=1;
    foreach(string prop in new[]{"_Color","_BaseColor"})if(m.HasProperty(prop))m.SetColor(prop,color);
    if(m.HasProperty("_Metallic"))m.SetFloat("_Metallic",d.metallic);foreach(string prop in new[]{"_Smoothness","_Glossiness"})if(m.HasProperty(prop))m.SetFloat(prop,d.name=="Green_Skin"?.30f:1-d.roughness);
    var tex=Texture(d.albedo,false);if(tex!=null)foreach(string prop in new[]{"_MainTex","_BaseMap","_BaseColorMap"})if(m.HasProperty(prop))m.SetTexture(prop,tex);
    var normal=Texture(d.normal,true);if(normal!=null){foreach(string prop in new[]{"_BumpMap","_NormalMap"})if(m.HasProperty(prop))m.SetTexture(prop,normal);m.EnableKeyword("_NORMALMAP");m.EnableKeyword("_NORMALMAP_TANGENT_SPACE");}
    Save(m,output+"/Materials/"+d.name+".mat");result[i]=AssetDatabase.LoadAssetAtPath<Material>(output+"/Materials/"+d.name+".mat");
   }
   return result;
  }
  struct VertexKey : IEquatable<VertexKey>
  {
   public Vector3 p,n;public Vector2 uv;public BoneWeight w;
   public bool Equals(VertexKey other)=>p.Equals(other.p)&&n.Equals(other.n)&&uv.Equals(other.uv)&&w.Equals(other.w);
   public override bool Equals(object other)=>other is VertexKey key&&Equals(key);
   public override int GetHashCode(){unchecked{return (((p.GetHashCode()*397)^n.GetHashCode())*397^uv.GetHashCode())*397^w.GetHashCode();}}
  }
  static Mesh MakeMesh(Level lod,Transform root,Transform[] bones,string name)
  {
   var v=new List<Vector3>();var n=new List<Vector3>();var uv=new List<Vector2>();var bw=new List<BoneWeight>();var faces=new List<int[]>();
   foreach(var p in lod.parts)
   {
    int count=p.p.Length/3;var tri=new int[count];var unique=new Dictionary<VertexKey,int>();
    if(p.n.Length!=p.p.Length||p.uv.Length!=count*2||p.j.Length!=count*4||p.w.Length!=count*4)throw new InvalidDataException("Invalid skin arrays");
    for(int i=0;i<count;i++)
    {
     int k=i*4;
     var key=new VertexKey{p=V(p.p,i*3),n=V(p.n,i*3).normalized,uv=new Vector2(p.uv[i*2],1-p.uv[i*2+1]),
      w=new BoneWeight{boneIndex0=p.j[k],boneIndex1=p.j[k+1],boneIndex2=p.j[k+2],boneIndex3=p.j[k+3],weight0=p.w[k],weight1=p.w[k+1],weight2=p.w[k+2],weight3=p.w[k+3]}};
     if(!unique.TryGetValue(key,out int index)){index=v.Count;unique.Add(key,index);v.Add(key.p);n.Add(key.n);uv.Add(key.uv);bw.Add(key.w);}
     tri[i]=index;
    }
    // Z reflection changes handedness: restore outward triangle winding.
    for(int i=0;i<tri.Length;i+=3){int tmp=tri[i+1];tri[i+1]=tri[i+2];tri[i+2]=tmp;}
    faces.Add(tri);
   }
   var mesh=new Mesh{name=name,indexFormat=v.Count>65535?IndexFormat.UInt32:IndexFormat.UInt16};mesh.SetVertices(v);mesh.SetNormals(n);mesh.SetUVs(0,uv);mesh.boneWeights=bw.ToArray();var bind=new Matrix4x4[bones.Length];for(int i=0;i<bones.Length;i++)bind[i]=bones[i].worldToLocalMatrix*root.localToWorldMatrix;mesh.bindposes=bind;
   mesh.subMeshCount=faces.Count;for(int i=0;i<faces.Count;i++)mesh.SetTriangles(faces[i],i);mesh.RecalculateBounds();mesh.RecalculateTangents();return mesh;
  }
  static AnimationCurve Curve(float[] times,float[] values,int stride,int channel,float sign)
  {
   var keys=new Keyframe[times.Length];for(int i=0;i<keys.Length;i++)
   {
    float val=values[i*stride+channel]*sign;float before=i==0?0:(val-values[(i-1)*stride+channel]*sign)/(times[i]-times[i-1]);float after=i==keys.Length-1?0:(values[(i+1)*stride+channel]*sign-val)/(times[i+1]-times[i]);keys[i]=new Keyframe(times[i],val,before,after);
   }
   bool constant=true;for(int i=1;i<keys.Length;i++)if(Mathf.Abs(keys[i].value-keys[0].value)>0.000001f){constant=false;break;}
   return constant?AnimationCurve.Constant(times[0],times[times.Length-1],keys[0].value):new AnimationCurve(keys);
  }
  static AnimationClip MakeClip(Clip source,string[] paths,int hips,string output)
  {
   var clip=new AnimationClip{name=source.name,frameRate=30,legacy=false};
   for(int i=0;i<paths.Length;i++)for(int k=0;k<4;k++)
   {
    // Reflection through Z maps a quaternion to (-x,-y,z,w).
    string prop="m_LocalRotation."+"xyzw"[k];AnimationUtility.SetEditorCurve(clip,EditorCurveBinding.FloatCurve(paths[i],typeof(Transform),prop),Curve(source.times,source.tracks[i].values,4,k,k<2?-1:1));
   }
   for(int k=0;k<3;k++)AnimationUtility.SetEditorCurve(clip,EditorCurveBinding.FloatCurve(paths[hips],typeof(Transform),"m_LocalPosition."+"xyz"[k]),Curve(source.times,source.hipsPositions,3,k,k==2?-1:1));
   clip.EnsureQuaternionContinuity();var settings=AnimationUtility.GetAnimationClipSettings(clip);settings.loopTime=source.loop;settings.loopBlend=source.loop;AnimationUtility.SetAnimationClipSettings(clip,settings);string clipPath=output+"/Animations/"+clip.name+".anim";Save(clip,clipPath);return AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
  }
  [MenuItem("Sniper Ridge/헐크 레퍼런스 에셋 재생성")]
  public static void Build()
  {
   if(EditorApplication.isPlaying)throw new InvalidOperationException("Stop Play before rebuilding.");
   var data=JsonUtility.FromJson<Character>(ReadSource());string output=Root+"/Generated";
   foreach(string sub in new[]{"","/Meshes","/Materials","/Animations"})Folder(output+sub);
   Folder("Assets/Resources/Hero");
   var previousMode=EditorSettings.serializationMode;GameObject root=null;
   // Deduplicate identical vertex attributes, preserving normals, UV seams and skin weights.
   EditorSettings.serializationMode=SerializationMode.ForceBinary;
   try
   {
    Material[] materials=Materials(output);
    root=new GameObject("HulkReference");var rig=new GameObject("Rig");rig.transform.SetParent(root.transform,false);
    var bones=new Transform[data.bones.Length];var ids=new Dictionary<string,int>();var paths=new string[bones.Length];
    for(int i=0;i<bones.Length;i++)
    {
     var b=data.bones[i];var node=new GameObject(b.name);node.transform.SetParent(string.IsNullOrEmpty(b.parent)?rig.transform:bones[ids[b.parent]],false);
     node.transform.localPosition=V(b.position);bones[i]=node.transform;ids.Add(b.name,i);paths[i]=AnimationUtility.CalculateTransformPath(node.transform,root.transform);
    }
    var lods=new LOD[data.lods.Length];
    for(int i=0;i<data.lods.Length;i++)
    {
     var go=new GameObject("LOD"+i);go.transform.SetParent(root.transform,false);var mesh=MakeMesh(data.lods[i],root.transform,bones,"HulkReference_LOD"+i);
     string path=output+"/Meshes/"+mesh.name+".asset";Save(mesh,path);
     var smr=go.AddComponent<SkinnedMeshRenderer>();smr.sharedMesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);smr.bones=bones;smr.rootBone=bones[ids["Hips"]];
     smr.quality=SkinQuality.Bone4;smr.localBounds=new Bounds(new Vector3(0,1.7f,0),new Vector3(4.5f,4.5f,4.5f));
     var slots=new Material[data.lods[i].parts.Length];for(int j=0;j<slots.Length;j++)slots[j]=materials[data.lods[i].parts[j].mat];smr.sharedMaterials=slots;
     lods[i]=new LOD(i==0?.30f:.012f,new Renderer[]{smr});
    }
    var lodgroup=root.AddComponent<LODGroup>();lodgroup.SetLODs(lods);lodgroup.RecalculateBounds();
    var animator=root.AddComponent<Animator>();var avatar=AvatarBuilder.BuildGenericAvatar(root,"");avatar.name="HulkReference_Generic";
    string avatarPath=output+"/Animations/HulkReference_Generic.asset";Save(avatar,avatarPath);animator.avatar=AssetDatabase.LoadAssetAtPath<Avatar>(avatarPath);animator.applyRootMotion=false;
    string controllerPath=output+"/Animations/HulkReference.controller";
    var controller=AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath);
    if(controller==null)controller=AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
    var sm=controller.layers[0].stateMachine;foreach(var state in sm.states)sm.RemoveState(state.state);
    foreach(var c in data.clips){var state=sm.AddState(c.name);state.motion=MakeClip(c,paths,ids["Hips"],output);state.writeDefaultValues=true;if(c.name=="Idle")sm.defaultState=state;}
    foreach(string name in new[]{"Transform","Clap","Air","Land"})
    {
     var state=sm.AddState(name);state.motion=HulkReferenceMotions.Build(name,paths,bones,ids,output);state.writeDefaultValues=true;
    }
    animator.runtimeAnimatorController=controller;animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
    bool ok;PrefabUtility.SaveAsPrefabAsset(root,"Assets/Resources/Hero/HulkReference.prefab",out ok);
    if(!ok)throw new IOException("Hulk prefab save failed");
    AssetDatabase.SaveAssets();Debug.Log("[Hulk Reference] Built supplied 43-bone model, 2 LODs, 5 pack clips + 4 gameplay clips.");
   }
   finally{if(root!=null)UnityEngine.Object.DestroyImmediate(root);EditorSettings.serializationMode=previousMode;}
  }
 }
}
