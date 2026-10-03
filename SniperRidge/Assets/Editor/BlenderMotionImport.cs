using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
namespace SniperRidge.EditorTools
{
    public static class BlenderMotionImport
    {
        public static void Run()
        {
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            const string folder="Assets/OliveTitan/Animations/";
            var data=AssetDatabase.LoadAssetAtPath<BlenderMotionSet>("Assets/Resources/Hero/OliveTitanMotion.asset");
            if(!data){data=ScriptableObject.CreateInstance<BlenderMotionSet>();AssetDatabase.CreateAsset(data,"Assets/Resources/Hero/OliveTitanMotion.asset");}
            foreach(string name in new[]{"Idle","Walk","Run","PunchRight","PunchLeft","Clap","JumpLoad","JumpAir","Land"})
            {
                string path=folder+(name=="Run"?"Titan_GameRun":"Titan_"+name)+".fbx";var importer=(ModelImporter)AssetImporter.GetAtPath(path);
                importer.animationType=ModelImporterAnimationType.Generic;importer.importAnimation=true;importer.optimizeGameObjects=false;
                importer.animationCompression=ModelImporterAnimationCompression.Off;importer.materialImportMode=ModelImporterMaterialImportMode.None;
                importer.SaveAndReimport();
                var clip=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().First(c=>!c.name.StartsWith("__preview__"));
                typeof(BlenderMotionSet).GetField(name).SetValue(data,clip);
                if(name=="Idle")data.SamplingRig=AssetDatabase.LoadAssetAtPath<GameObject>(path);
                Debug.Log("[Blender clip] "+name+" length="+clip.length+" curves="+AnimationUtility.GetCurveBindings(clip).Length);
            }
            data.FullBodyRun=true;data.FullBodyRunStride=.86f/.38f;
            EditorUtility.SetDirty(data);AssetDatabase.SaveAssets();
            OliveTitanIntegration.BuildAndValidate();
        }
    }
}
