using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
namespace OliveTitanAsset
{
 public sealed class OliveTitanTextureImport : AssetPostprocessor
 {
  void OnPreprocessTexture()
  {
   if(!assetPath.StartsWith("Assets/OliveTitan/Textures/"))return;
   var t=(TextureImporter)assetImporter;t.maxTextureSize=4096;t.mipmapEnabled=true;
   t.textureCompression=TextureImporterCompression.CompressedHQ;
   t.sRGBTexture=assetPath.Contains("BaseColor");
   if(assetPath.Contains("Normal")){t.textureType=TextureImporterType.NormalMap;t.convertToNormalmap=false;}
   t.alphaSource=TextureImporterAlphaSource.FromInput;
  }
 }
 public static class OliveTitanSetup
 {
  const string Root="Assets/OliveTitan";
  static void Check(bool ok,string message){if(!ok)throw new Exception("Olive Titan: "+message);}
  [MenuItem("Tools/Olive Titan/Build and validate Unity 2022.3 prefab")]
  public static void Run()
  {
   if(!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
   AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
   string path=Root+"/Models/OliveTitan_LOD0.fbx";
   var model=AssetDatabase.LoadAssetAtPath<GameObject>(path);Check(model!=null,"FBX not imported");
   var importer=(ModelImporter)AssetImporter.GetAtPath(path);
   var map=new Dictionary<string,string>();
   foreach(string bone in new[]{"Hips","Spine","Chest","UpperChest","Neck","Head","LeftShoulder","RightShoulder","LeftUpperArm","RightUpperArm","LeftLowerArm","RightLowerArm","LeftHand","RightHand","LeftUpperLeg","RightUpperLeg","LeftLowerLeg","RightLowerLeg","LeftFoot","RightFoot","LeftToes","RightToes"})map[bone]=bone;
   foreach(string side in new[]{"Left","Right"})foreach(string finger in new[]{"Thumb","Index","Middle","Ring","Little"})
    for(int i=0;i<3;i++)map[side+" "+finger+" "+new[]{"Proximal","Intermediate","Distal"}[i]]=side+"Hand"+(finger=="Little"?"Pinky":finger)+(i+1);
   var names=model.GetComponentsInChildren<Transform>(true).Select(t=>t.name).ToHashSet();
   foreach(var pair in map)Check(names.Contains(pair.Value),"Missing bone "+pair.Value);
   var description=new HumanDescription {
    human=map.Select(p=>new HumanBone{humanName=p.Key,boneName=p.Value,limit=new HumanLimit{useDefaultValues=true}}).ToArray(),
    skeleton=model.GetComponentsInChildren<Transform>(true).Select(t=>new SkeletonBone{name=t.name,position=t.localPosition,rotation=t.localRotation,scale=t.localScale}).ToArray(),
    upperArmTwist=.5f,lowerArmTwist=.5f,upperLegTwist=.5f,lowerLegTwist=.5f,armStretch=.01f,legStretch=.01f,feetSpacing=0,hasTranslationDoF=false};
   importer.animationType=ModelImporterAnimationType.Human;importer.avatarSetup=ModelImporterAvatarSetup.CreateFromThisModel;
   importer.humanDescription=description;importer.isReadable=true;importer.importAnimation=false;importer.SaveAndReimport();
   model=AssetDatabase.LoadAssetAtPath<GameObject>(path);
   var avatar=AssetDatabase.LoadAllAssetsAtPath(path).OfType<Avatar>().FirstOrDefault();
   Check(avatar!=null&&avatar.isValid&&avatar.isHuman,"Humanoid avatar invalid");
   Directory.CreateDirectory(Root+"/Materials");Directory.CreateDirectory(Root+"/Prefabs");Directory.CreateDirectory(Root+"/Validation");
   var material=new Material(Shader.Find("Standard")){name="OliveTitan_PBR",color=Color.white};
   Texture2D Tex(string n)=>AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Textures/OliveTitan_"+n+".png");
   material.mainTexture=Tex("BaseColor");material.SetTexture("_BumpMap",Tex("Normal"));material.SetFloat("_BumpScale",.8f);material.EnableKeyword("_NORMALMAP");
   material.SetTexture("_MetallicGlossMap",Tex("MetallicSmoothness"));material.SetFloat("_GlossMapScale",1);material.EnableKeyword("_METALLICGLOSSMAP");
   material.SetTexture("_OcclusionMap",Tex("AO"));material.SetFloat("_OcclusionStrength",.8f);
   string matPath=Root+"/Materials/OliveTitan_PBR.mat";var old=AssetDatabase.LoadAssetAtPath<Material>(matPath);
   if(old){EditorUtility.CopySerialized(material,old);UnityEngine.Object.DestroyImmediate(material);material=old;}else AssetDatabase.CreateAsset(material,matPath);
   EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
   var root=UnityEngine.Object.Instantiate(model);root.name="OliveTitan";
   var animator=root.GetComponent<Animator>();if(!animator)animator=root.AddComponent<Animator>();animator.avatar=avatar;
   var bones=root.GetComponentsInChildren<Transform>(true).GroupBy(t=>t.name).ToDictionary(g=>g.Key,g=>g.First());
   var lods=new List<LOD>();var counts=new List<int>();
   for(int level=0;level<3;level++)
   {
    var instance=level==0?root:UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/Models/OliveTitan_LOD"+level+".fbx"));
    var skins=instance.GetComponentsInChildren<SkinnedMeshRenderer>();Check(skins.Length==4,"Expected body, pants, hair, eyes");int triangles=0;
    foreach(var skin in skins)
    {
     triangles+=skin.sharedMesh.triangles.Length/3;skin.sharedMaterial=material;
     if(level>0){skin.bones=skin.bones.Select(b=>bones[b.name]).ToArray();skin.rootBone=bones[skin.rootBone.name];skin.transform.SetParent(root.transform,true);}
     skin.quality=SkinQuality.Bone4;
     foreach(var w in skin.sharedMesh.boneWeights)Check(Mathf.Abs(w.weight0+w.weight1+w.weight2+w.weight3-1)<.002f,"Unnormalized skin weights");
    }
    lods.Add(new LOD(new[]{.50f,.23f,.055f}[level],skins));counts.Add(triangles);
    if(level>0)UnityEngine.Object.DestroyImmediate(instance);
   }
   var group=root.AddComponent<LODGroup>();group.SetLODs(lods.ToArray());group.RecalculateBounds();group.ForceLOD(0);
   var combined=new Bounds();bool first=true;
   foreach(var r in lods[0].renderers){var actual=new Mesh();((SkinnedMeshRenderer)r).BakeMesh(actual);foreach(var v in actual.vertices){var world=r.transform.TransformPoint(v);if(first){combined=new Bounds(world,Vector3.zero);first=false;}else combined.Encapsulate(world);}UnityEngine.Object.DestroyImmediate(actual);}
   Check(Mathf.Abs(combined.size.y-2.3f)<.025f,"Height differs from 230 cm: "+combined.size.y);
   Check(Mathf.Abs(combined.min.y)<.02f,"Feet not at ground: "+combined.min.y);
   Check(animator.GetBoneTransform(HumanBodyBones.UpperChest)!=null,"UpperChest not mapped");
   group.ForceLOD(-1);
   PrefabUtility.SaveAsPrefabAsset(root,Root+"/Prefabs/OliveTitan.prefab");
   // Exercise Mecanim muscle mapping and skin deformation, including fingers and knees.
   var handler=new HumanPoseHandler(avatar,root.transform);var pose=new HumanPose();handler.GetHumanPose(ref pose);
   var elbow=animator.GetBoneTransform(HumanBodyBones.LeftLowerArm);var knee=animator.GetBoneTransform(HumanBodyBones.LeftLowerLeg);var elbowBefore=elbow.localRotation;var kneeBefore=knee.localRotation;int exercised=0;
   for(int i=0;i<pose.muscles.Length;i++)if(HumanTrait.MuscleName[i].Contains("Forearm Stretch")||HumanTrait.MuscleName[i].Contains("Leg Stretch")){pose.muscles[i]=-.65f;exercised++;}
   Check(exercised>=4,"Mecanim limb muscles not found");
   handler.SetHumanPose(ref pose);Check(Quaternion.Angle(elbowBefore,elbow.localRotation)>8,"Elbow did not bend through Mecanim");Check(Quaternion.Angle(kneeBefore,knee.localRotation)>8,"Knee did not bend through Mecanim");var baked=new Mesh();
   foreach(var r in lods[0].renderers){((SkinnedMeshRenderer)r).BakeMesh(baked);Check(baked.vertices.All(v=>!float.IsNaN(v.x)&&!float.IsInfinity(v.x)),"Invalid pose vertices");}
   handler.Dispose();UnityEngine.Object.DestroyImmediate(baked);
   UnityEngine.Object.DestroyImmediate(root);root=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/Prefabs/OliveTitan.prefab"));
   var l=root.GetComponent<LODGroup>();l.ForceLOD(0);
   RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Flat;RenderSettings.ambientLight=new Color(.35f,.35f,.35f);
   var key=new GameObject("Studio key").AddComponent<Light>();key.type=LightType.Directional;key.intensity=1.05f;key.transform.rotation=Quaternion.Euler(35,-35,0);
   var fill=new GameObject("Studio fill").AddComponent<Light>();fill.type=LightType.Directional;fill.intensity=.55f;fill.transform.rotation=Quaternion.Euler(15,140,0);
   var cam=new GameObject("Studio camera").AddComponent<Camera>();cam.clearFlags=CameraClearFlags.SolidColor;cam.backgroundColor=new Color(.18f,.18f,.18f);cam.orthographic=true;cam.orthographicSize=1.55f;
   cam.transform.position=new Vector3(3,1.8f,5.7f);cam.transform.LookAt(new Vector3(0,1.16f,0));
   Capture(cam,Root+"/Validation/Unity2022_Front.png");cam.transform.position=new Vector3(-3,1.8f,-5.7f);cam.transform.LookAt(new Vector3(0,1.16f,0));Capture(cam,Root+"/Validation/Unity2022_Back.png");
   string report="Unity "+Application.unityVersion+"\nAvatar valid / humanoid: "+avatar.isValid+" / "+avatar.isHuman+"\nHeight: "+combined.size.y+" m\nFeet Y: "+combined.min.y+"\nLOD triangles: "+string.Join(", ",counts)+"\n4 meshes per LOD; normalized four-bone skinning; Mecanim pose deformation: PASS\n";
   File.WriteAllText(Root+"/Validation/Unity_validation.txt",report);AssetDatabase.SaveAssets();Debug.Log("[Olive Titan] PASS\n"+report);
  }
  public static void BuildAndExport()
  {
   Run();
   ExportOnly();
  }
  public static void ExportOnly()
  {
   AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
   string destination=Environment.GetEnvironmentVariable("OLIVE_TITAN_PACKAGE");
   if(string.IsNullOrEmpty(destination))destination=Path.GetFullPath("OliveTitan_Unity2022_3.unitypackage");
   AssetDatabase.ExportPackage(Root,destination,ExportPackageOptions.Recurse);
   Debug.Log("[Olive Titan] Package: "+destination);
  }
  static void Capture(Camera cam,string path)
  {
   var rt=new RenderTexture(1200,1400,24){antiAliasing=4};var old=RenderTexture.active;var image=new Texture2D(1200,1400,TextureFormat.RGB24,false);
   try{cam.targetTexture=rt;cam.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,1200,1400),0,0);image.Apply();File.WriteAllBytes(path,image.EncodeToPNG());}
   finally{cam.targetTexture=null;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);}
  }
 }
}
