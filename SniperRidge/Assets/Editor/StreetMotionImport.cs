using System;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class StreetMotionImport
    {
        public static void Run()
        {
            var set=Resources.Load<NativeMutantSet>(HulkVisual.Resource);
            set.ThrowIn=Import("Throw In");set.Harvesting=Import("Harvesting");set.PoleAttack=Import("Sword And Shield Attack");
            EnemyMeleeDeathImport.Retarget("Assets/MutantCharacter/Source/Grenade Throw.fbx","Assets/Resources/Enemies/GrenadeThrow.anim","Grenade Throw");
            EditorUtility.SetDirty(set);AssetDatabase.SaveAssets();Debug.Log("[Street motions] Imported requested Mixamo clips and soldier grenade retarget.");
        }
        static AnimationClip Import(string name)
        {
            string path="Assets/MutantCharacter/Source/"+name+".fbx";
            var importer=(ModelImporter)AssetImporter.GetAtPath(path);
            if(!importer)throw new Exception("Missing Mixamo FBX: "+path);
            importer.animationType=ModelImporterAnimationType.Generic;importer.avatarSetup=ModelImporterAvatarSetup.NoAvatar;
            importer.importAnimation=true;importer.optimizeGameObjects=false;importer.animationCompression=ModelImporterAnimationCompression.Off;importer.SaveAndReimport();
            var source=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().First(c=>!c.name.StartsWith("__preview__"));
            var clip=UnityEngine.Object.Instantiate(source);clip.name=name;
            var model=UnityEngine.Object.Instantiate(Resources.Load<NativeMutantSet>(HulkVisual.Resource).Model);
            try
            {
                source.SampleAnimation(model,0);var hip=model.GetComponentsInChildren<Transform>().First(t=>t.name=="mixamorig:Hips");
                string root=AnimationUtility.CalculateTransformPath(hip,model.transform);
                // World movement belongs to the controller; retain all native joint rotations and root height.
                clip.SetCurve(root,typeof(Transform),"m_LocalPosition.x",AnimationCurve.Constant(0,clip.length,0));
                clip.SetCurve(root,typeof(Transform),"m_LocalPosition.z",AnimationCurve.Constant(0,clip.length,0));
                var settings=AnimationUtility.GetAnimationClipSettings(clip);settings.loopTime=false;AnimationUtility.SetAnimationClipSettings(clip,settings);
                string output="Assets/MutantCharacter/Clips/"+name+".anim";var previous=AssetDatabase.LoadAssetAtPath<AnimationClip>(output);
                if(previous){EditorUtility.CopySerialized(clip,previous);UnityEngine.Object.DestroyImmediate(clip);clip=previous;}else AssetDatabase.CreateAsset(clip,output);
                Debug.Log("[Street motion] "+name+" length="+source.length);
                return clip;
            }
            finally{UnityEngine.Object.DestroyImmediate(model);}
        }
    }
}
