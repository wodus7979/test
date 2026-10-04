using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class NativeMutantImport
    {
        const string Root="Assets/MutantCharacter/";
        [MenuItem("Sniper Ridge/원본 캐릭터와 Mixamo 동작 연결")]
        public static void Run()
        {
            Directory.CreateDirectory(Root+"Clips");Directory.CreateDirectory(Root+"Textures");Directory.CreateDirectory(Root+"Materials");AssetDatabase.Refresh();
            string[] names={"Standing Taunt Battlecry","Zombie Punching","Mutant Jumping","Fast Run","Fighting Idle","Taking Punch","Standing Block Idle"};
            var clips=new AnimationClip[names.Length];
            for(int i=0;i<names.Length;i++)
            {
                string path=Root+"Source/"+names[i]+".fbx";
                var importer=(ModelImporter)AssetImporter.GetAtPath(path);
                if(importer==null)throw new Exception("Missing supplied FBX: "+path);
                importer.animationType=ModelImporterAnimationType.Generic;importer.avatarSetup=ModelImporterAvatarSetup.NoAvatar;
                importer.importAnimation=true;importer.optimizeGameObjects=false;importer.animationCompression=ModelImporterAnimationCompression.Off;
                importer.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;importer.SaveAndReimport();
                if(i==0)importer.ExtractTextures(Root+"Textures");
                AssetDatabase.Refresh();
                var source=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().First(c=>!c.name.StartsWith("__preview__"));
                var copy=UnityEngine.Object.Instantiate(source);copy.name=names[i];
                var settings=AnimationUtility.GetAnimationClipSettings(copy);settings.loopTime=i==3||i==4||i==6;AnimationUtility.SetAnimationClipSettings(copy,settings);
                string clipPath=Root+"Clips/"+names[i]+".anim";var existing=AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
                if(existing){EditorUtility.CopySerialized(copy,existing);UnityEngine.Object.DestroyImmediate(copy);clips[i]=existing;}else{AssetDatabase.CreateAsset(copy,clipPath);clips[i]=copy;}
            }
            string normalPath=Root+"Textures/pumpkinHulk_normal.png";
            var normalImporter=(TextureImporter)AssetImporter.GetAtPath(normalPath);normalImporter.textureType=TextureImporterType.NormalMap;normalImporter.SaveAndReimport();
            var model=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"Source/Standing Taunt Battlecry.fbx"));
            try
            {
                foreach(var a in model.GetComponentsInChildren<Animator>())UnityEngine.Object.DestroyImmediate(a);
                foreach(var a in model.GetComponentsInChildren<Animation>())UnityEngine.Object.DestroyImmediate(a);
                var skin=model.GetComponentInChildren<SkinnedMeshRenderer>();
                var material=new Material(skin.sharedMaterial);material.name="PumpkinHulk original";
                material.mainTexture=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"Textures/pumpkinHulk_diffuse.png");
                material.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath));material.EnableKeyword("_NORMALMAP");
                var existing=AssetDatabase.LoadAssetAtPath<Material>(Root+"Materials/PumpkinHulk.mat");
                if(existing){EditorUtility.CopySerialized(material,existing);UnityEngine.Object.DestroyImmediate(material);material=existing;}else AssetDatabase.CreateAsset(material,Root+"Materials/PumpkinHulk.mat");
                skin.sharedMaterial=material;skin.updateWhenOffscreen=true;
                string dataPath="Assets/Resources/Hero/NativeMutant.asset";
                var set=AssetDatabase.LoadAssetAtPath<NativeMutantSet>(dataPath);
                if(!set){set=ScriptableObject.CreateInstance<NativeMutantSet>();AssetDatabase.CreateAsset(set,dataPath);}
                set.Transform=clips[0];set.Punch=clips[1];set.Jump=clips[2];set.Run=clips[3];set.Idle=clips[4];set.Hit=clips[5];set.Block=clips[6];
                clips[2].SampleAnimation(model,0);
                var mesh=new Mesh();skin.BakeMesh(mesh);var bounds=new Bounds(skin.transform.TransformPoint(mesh.vertices[0]),Vector3.zero);
                foreach(var vertex in mesh.vertices)bounds.Encapsulate(skin.transform.TransformPoint(vertex));UnityEngine.Object.DestroyImmediate(mesh);
                set.Scale=HulkController.Height/bounds.size.y;set.GroundOffset=-bounds.min.y*set.Scale;
                var hip=model.GetComponentsInChildren<Transform>().First(t=>t.name=="mixamorig:Hips");
                clips[4].SampleAnimation(model,0);set.IdleStart=hip.localPosition;
                clips[4].SampleAnimation(model,clips[4].length);set.IdleEnd=hip.localPosition;
                clips[3].SampleAnimation(model,0);set.RunStart=hip.localPosition;
                clips[3].SampleAnimation(model,clips[3].length);set.RunEnd=hip.localPosition;
                set.RunStride=Vector3.ProjectOnPlane(set.RunEnd-set.RunStart,Vector3.up).magnitude*set.Scale;
                set.JumpTakeoff=1.2f; // Source clip time, independent of the gameplay wind-up.
                set.JumpApex=1.5f;set.JumpLanding=1.9f;
                clips[2].SampleAnimation(model,set.JumpTakeoff);float liftStart=hip.localPosition.y;
                clips[2].SampleAnimation(model,set.JumpLanding);float liftEnd=hip.localPosition.y;
                var lift=new AnimationCurve();
                for(int f=0;f<=190;f++)
                {
                    float t=clips[2].length*f/190;clips[2].SampleAnimation(model,t);
                    float envelope=t>set.JumpTakeoff&&t<set.JumpLanding?Mathf.Max(0,hip.localPosition.y-Mathf.Lerp(liftStart,liftEnd,Mathf.InverseLerp(set.JumpTakeoff,set.JumpLanding,t))):0;
                    lift.AddKey(t,envelope);
                }
                set.JumpRootLift=lift;set.FourActionsOnly=true;
                clips[2].SampleAnimation(model,0);model.name="Native mutant";
                set.Model=PrefabUtility.SaveAsPrefabAsset(model,Root+"NativeMutant.prefab");
                EditorUtility.SetDirty(set);AssetDatabase.SaveAssets();
                EnemyMeleeDeathImport.Run();
                Directory.CreateDirectory("Logs");File.WriteAllText("Logs/native-mutant-import.txt",$"Original FBX model: {skin.sharedMesh.name}, vertices={skin.sharedMesh.vertexCount}\nUniform scale={set.Scale:F4}; groundOffset={set.GroundOffset:F4}; runStride={set.RunStride:F4}m\n"+string.Join("\n",clips.Select(c=>$"{c.name}: {c.length:F4}s")));
            }
            finally{UnityEngine.Object.DestroyImmediate(model);}
        }
    }
}
