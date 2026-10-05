using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class EnemyMeleeDeathImport
    {
        static string Key(Transform t)=>t.name.Replace(":","").Replace("_","").ToLowerInvariant().Replace("mixamorig","");
        static int Depth(Transform t){int d=0;while(t.parent){d++;t=t.parent;}return d;}
        static void BindPose(GameObject root)
        {
            var world=new Dictionary<Transform,Matrix4x4>();
            foreach(var skin in root.GetComponentsInChildren<SkinnedMeshRenderer>())
                for(int i=0;i<skin.bones.Length;i++)if(skin.bones[i])world[skin.bones[i]]=skin.transform.localToWorldMatrix*skin.sharedMesh.bindposes[i].inverse;
            foreach(var pair in world.OrderBy(p=>Depth(p.Key)))pair.Key.SetPositionAndRotation(pair.Value.GetColumn(3),pair.Value.rotation);
        }
        sealed class Bone
        {
            public Transform from,to;public Quaternion fromRest,toRest;public Vector3 fromPosition,toPosition;
            public string path;public AnimationCurve[] rotation=Enumerable.Range(0,4).Select(_=>new AnimationCurve()).ToArray();
            public AnimationCurve[] position=Enumerable.Range(0,3).Select(_=>new AnimationCurve()).ToArray();
        }
        public static void Run()
            =>Retarget("Assets/MutantCharacter/Source/Standing React Death Right.fbx","Assets/Resources/Enemies/StandingReactDeathRight.anim","Standing React Death Right",true);
        public static void Retarget(string sourcePath,string output,string label,bool death=false)
        {
            var importer=(ModelImporter)AssetImporter.GetAtPath(sourcePath);
            importer.animationType=ModelImporterAnimationType.Generic;importer.avatarSetup=ModelImporterAvatarSetup.NoAvatar;
            importer.importAnimation=true;importer.optimizeGameObjects=false;importer.animationCompression=ModelImporterAnimationCompression.Off;importer.SaveAndReimport();
            var clip=AssetDatabase.LoadAllAssetsAtPath(sourcePath).OfType<AnimationClip>().First(c=>!c.name.StartsWith("__preview__"));
            var source=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/MutantCharacter/Source/Standing Taunt Battlecry.fbx"));
            var target=UnityEngine.Object.Instantiate(Resources.Load<GameObject>("Enemies/SoldierModel"));
            try
            {
                foreach(var a in source.GetComponentsInChildren<Animator>())a.enabled=false;
                foreach(var a in target.GetComponentsInChildren<Animator>())a.enabled=false;
                BindPose(source);BindPose(target);
                var from=source.GetComponentsInChildren<Transform>().GroupBy(Key).ToDictionary(g=>g.Key,g=>g.First());
                var bones=new List<Bone>();
                foreach(var to in target.GetComponentsInChildren<Transform>())
                    if(from.TryGetValue(Key(to),out var f)&&f!=source.transform&&to!=target.transform)
                        bones.Add(new Bone{from=f,to=to,fromRest=f.localRotation,toRest=to.localRotation,fromPosition=f.localPosition,toPosition=to.localPosition,path=AnimationUtility.CalculateTransformPath(to,target.transform)});
                var hips=bones.First(b=>Key(b.to)=="hips");
                float scale=(hips.to.position.y-target.transform.position.y)/(hips.from.position.y-source.transform.position.y);
                var skins=target.GetComponentsInChildren<SkinnedMeshRenderer>();var baked=new Mesh();
                var result=new AnimationClip{name=label,frameRate=60};
                Quaternion[] previous=new Quaternion[bones.Count];
                int frames=Mathf.CeilToInt(clip.length*60);
                for(int f=0;f<=frames;f++)
                {
                    float time=Mathf.Min(clip.length,f/60f);clip.SampleAnimation(source,time);
                    for(int i=0;i<bones.Count;i++)
                    {
                        var b=bones[i];b.to.localRotation=b.toRest*Quaternion.Inverse(b.fromRest)*b.from.localRotation;
                        b.to.localPosition=b.toPosition;
                    }
                    Vector3 delta=hips.from.parent.TransformVector(hips.from.localPosition-hips.fromPosition)*scale;
                    if(!death){delta.x=0;delta.z=0;}
                    hips.to.position+=target.transform.TransformVector(source.transform.InverseTransformVector(delta));
                    // Preserve limb lengths, then keep the retargeted skin above the floor.
                    float minimum=float.PositiveInfinity;
                    foreach(var skin in skins){skin.BakeMesh(baked);foreach(var v in baked.vertices)minimum=Mathf.Min(minimum,skin.transform.TransformPoint(v).y-target.transform.position.y);}
                    if(minimum<0)hips.to.position+=Vector3.up*(-minimum+.005f);
                    for(int i=0;i<bones.Count;i++)
                    {
                        var b=bones[i];var q=b.to.localRotation;
                        if(f>0&&Quaternion.Dot(previous[i],q)<0)q=new Quaternion(-q.x,-q.y,-q.z,-q.w);previous[i]=q;
                        for(int j=0;j<4;j++)b.rotation[j].AddKey(time,q[j]);
                        if(b==hips)for(int j=0;j<3;j++)b.position[j].AddKey(time,b.to.localPosition[j]);
                    }
                }
                foreach(var b in bones)
                {
                    for(int j=0;j<4;j++)result.SetCurve(b.path,typeof(Transform),"m_LocalRotation."+"xyzw"[j],b.rotation[j]);
                    // Reset proportions even when transitioning from a procedural cover pose.
                    for(int j=0;j<3;j++)result.SetCurve(b.path,typeof(Transform),"m_LocalPosition."+"xyz"[j],b==hips?b.position[j]:AnimationCurve.Constant(0,clip.length,b.toPosition[j]));
                }
                result.EnsureQuaternionContinuity();
                string path=output;
                var existing=AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
                if(existing){EditorUtility.CopySerialized(result,existing);UnityEngine.Object.DestroyImmediate(result);}else AssetDatabase.CreateAsset(result,path);
                AssetDatabase.SaveAssets();UnityEngine.Object.DestroyImmediate(baked);
                Directory.CreateDirectory("Logs");File.WriteAllText("Logs/"+label.Replace(" ","-")+"-import.txt",$"Source: {clip.name}, duration {clip.length:F3}s, {bones.Count} mapped bones, hip ratio {scale:F4}\nSource hip rest {hips.fromPosition}, target {hips.toPosition}\n");
            }
            finally{UnityEngine.Object.DestroyImmediate(source);UnityEngine.Object.DestroyImmediate(target);}
        }
    }
}
