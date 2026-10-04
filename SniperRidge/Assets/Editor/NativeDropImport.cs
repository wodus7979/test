using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    // Mixamo Jumping Down: Male Hulking Giant Jump Down, same uploaded native skeleton.
    public static class NativeDropImport
    {
        public const string Source="Assets/MutantCharacter/Source/Jumping Down.fbx";
        public static void Run()
        {
            var importer=(ModelImporter)AssetImporter.GetAtPath(Source);
            if(!importer)throw new Exception("Missing Mixamo Jumping Down FBX");
            importer.animationType=ModelImporterAnimationType.Generic;importer.avatarSetup=ModelImporterAvatarSetup.NoAvatar;
            importer.importAnimation=true;importer.optimizeGameObjects=false;importer.animationCompression=ModelImporterAnimationCompression.Off;importer.SaveAndReimport();
            var source=AssetDatabase.LoadAllAssetsAtPath(Source).OfType<AnimationClip>().First(c=>!c.name.StartsWith("__preview__"));
            var set=Resources.Load<NativeMutantSet>(HulkVisual.Resource);var model=UnityEngine.Object.Instantiate(set.Model);
            try
            {
                var bones=model.GetComponentsInChildren<Transform>();var hip=bones.First(b=>b.name=="mixamorig:Hips");
                var left=bones.First(b=>b.name=="mixamorig:LeftToeBase");var right=bones.First(b=>b.name=="mixamorig:RightToeBase");
                const float takeoff=1f,apex=1.17f,landing=1.633333f;
                source.SampleAnimation(model,takeoff);float upperFloor=Mathf.Min(left.position.y,right.position.y);Vector3 start=hip.localPosition;
                source.SampleAnimation(model,landing);float lowerFloor=Mathf.Min(left.position.y,right.position.y);
                float flight=landing-takeoff,peakTime=apex-takeoff;
                // Remove only root travel. All supplied joint rotations and limb translations stay native.
                float gravity=2*(upperFloor-lowerFloor)/(flight*flight-2*peakTime*flight);
                var vertical=new AnimationCurve();
                for(int frame=0;frame<=Mathf.CeilToInt(source.length*60);frame++)
                {
                    float time=Mathf.Min(source.length,frame/60f);source.SampleAnimation(model,time);
                    float t=Mathf.Clamp(time-takeoff,0,flight);
                    float trajectory=upperFloor+gravity*peakTime*t-.5f*gravity*t*t;
                    vertical.AddKey(time,hip.localPosition.y-trajectory);
                }
                var clip=UnityEngine.Object.Instantiate(source);clip.name="Jumping Down";
                string path=AnimationUtility.CalculateTransformPath(hip,model.transform);
                clip.SetCurve(path,typeof(Transform),"m_LocalPosition.x",AnimationCurve.Constant(0,clip.length,start.x));
                clip.SetCurve(path,typeof(Transform),"m_LocalPosition.y",vertical);
                clip.SetCurve(path,typeof(Transform),"m_LocalPosition.z",AnimationCurve.Constant(0,clip.length,0));
                var settings=AnimationUtility.GetAnimationClipSettings(clip);settings.loopTime=false;AnimationUtility.SetAnimationClipSettings(clip,settings);
                const string output="Assets/MutantCharacter/Clips/Jumping Down.anim";
                var previous=AssetDatabase.LoadAssetAtPath<AnimationClip>(output);
                if(previous){EditorUtility.CopySerialized(clip,previous);UnityEngine.Object.DestroyImmediate(clip);set.JumpDown=previous;}else{AssetDatabase.CreateAsset(clip,output);set.JumpDown=clip;}
                set.DropTakeoff=takeoff;set.DropApex=apex;set.DropLanding=landing;
                EditorUtility.SetDirty(set);AssetDatabase.SaveAssets();
                Directory.CreateDirectory("Logs");File.WriteAllText("Logs/native-drop-import.txt",$"Mixamo Jumping Down / Male Hulking Giant Jump Down\nlength={source.length}; takeoff={takeoff}; apex={apex}; landing={landing}\nsource platform height={upperFloor-lowerFloor:F3}m; root travel removed, native joints retained.\n");
            }
            finally{UnityEngine.Object.DestroyImmediate(model);}
        }
    }
}
