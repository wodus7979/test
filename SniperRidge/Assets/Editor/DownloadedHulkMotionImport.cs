using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace SniperRidge.EditorTools
{
    // Retarget the user's animation-only Mixamo FBXs through Mecanim, then bake
    // target-local curves for the game's existing explicit animation sampler.
    public static class DownloadedHulkMotionImport
    {
        const string Source="Assets/OliveTitan/Animations/Downloaded/";
        const string Baked="Assets/OliveTitan/Animations/Retargeted/";
        static readonly List<string> report=new List<string>();
        [MenuItem("Sniper Ridge/다운로드한 헐크 동작 적용")]
        public static void Run()
        {
            if(!Application.isBatchMode&&!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo())return;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            Directory.CreateDirectory(Baked);AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            report.Clear();
            var run=Import("Running",true,false);
            var punch=Import("Mutant Punch",false,true);
            var kick=Import("Flying Kick",false,false);
            var set=AssetDatabase.LoadAssetAtPath<BlenderMotionSet>("Assets/Resources/Hero/OliveTitanMotion.asset");
            set.Run=Bake(run[0],"DownloadedRun",true);
            set.PunchRight=Bake(punch[0],"DownloadedPunchRight",false);
            set.PunchLeft=Bake(punch[1],"DownloadedPunchLeft",false);
            set.Kick=Bake(kick[0],"DownloadedFlyingKick",false);
            set.FullBodyRun=true;set.FullBodyCombat=true;
            set.FullBodyRunStride=2.6f;
            EditorUtility.SetDirty(set);AssetDatabase.SaveAssets();
            Directory.CreateDirectory("Logs");File.WriteAllLines("Logs/downloaded-motion-import.txt",report);
            Debug.Log("[Downloaded motion] Retargeted run, alternating punches and flying kick.\n"+string.Join("\n",report));
        }
        static AnimationClip[] Import(string name,bool loop,bool mirror)
        {
            string path=Source+name+".fbx";
            var model=AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if(!model)throw new Exception("Missing user FBX: "+path);
            var importer=(ModelImporter)AssetImporter.GetAtPath(path);
            var names=model.GetComponentsInChildren<Transform>().ToDictionary(t=>t.name.Split(':').Last(),t=>t.name);
            var map=new Dictionary<string,string>{{"Hips","Hips"},{"Spine","Spine"},{"Chest","Spine1"},{"UpperChest","Spine2"},{"Neck","Neck"},{"Head","Head"}};
            foreach(string side in new[]{"Left","Right"})
            {
                foreach(var pair in new[]{("Shoulder","Shoulder"),("UpperArm","Arm"),("LowerArm","ForeArm"),("Hand","Hand"),("UpperLeg","UpLeg"),("LowerLeg","Leg"),("Foot","Foot"),("Toes","ToeBase")})map[side+pair.Item1]=side+pair.Item2;
                foreach(string digit in new[]{"Thumb","Index","Middle","Ring","Little"})
                    for(int j=0;j<3;j++)map[side+" "+digit+" "+new[]{"Proximal","Intermediate","Distal"}[j]]=side+"Hand"+(digit=="Little"?"Pinky":digit)+(j+1);
            }
            importer.animationType=ModelImporterAnimationType.Human;
            importer.avatarSetup=ModelImporterAvatarSetup.CreateFromThisModel;
            importer.humanDescription=new HumanDescription {
                human=map.Select(p=>new HumanBone{humanName=p.Key,boneName=names[p.Value],limit=new HumanLimit{useDefaultValues=true}}).ToArray(),
                skeleton=model.GetComponentsInChildren<Transform>().Select(t=>new SkeletonBone{name=t.name,position=t.localPosition,rotation=t.localRotation,scale=t.localScale}).ToArray(),
                upperArmTwist=.5f,lowerArmTwist=.5f,upperLegTwist=.5f,lowerLegTwist=.5f,armStretch=0,legStretch=0};
            importer.importAnimation=true;importer.optimizeGameObjects=false;
            importer.animationCompression=ModelImporterAnimationCompression.Off;
            importer.materialImportMode=ModelImporterMaterialImportMode.None;
            var original=importer.defaultClipAnimations[0];
            ModelImporterClipAnimation Take(bool reflected)=>new ModelImporterClipAnimation {
                name=name+(reflected?" Mirrored":""),takeName=original.takeName,firstFrame=original.firstFrame,lastFrame=original.lastFrame,
                loopTime=loop,loopPose=loop,mirror=reflected,lockRootRotation=true,keepOriginalOrientation=true,
                lockRootHeightY=true,keepOriginalPositionY=true,lockRootPositionXZ=false,keepOriginalPositionXZ=false};
            importer.clipAnimations=mirror?new[]{Take(false),Take(true)}:new[]{Take(false)};
            importer.SaveAndReimport();
            var avatar=AssetDatabase.LoadAllAssetsAtPath(path).OfType<Avatar>().FirstOrDefault();
            if(!avatar||!avatar.isValid||!avatar.isHuman)throw new Exception("Humanoid import failed: "+name);
            var clips=AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().Where(c=>!c.name.StartsWith("__preview__")).OrderBy(c=>c.name.EndsWith("Mirrored")?1:0).ToArray();
            if(clips.Length!=(mirror?2:1))throw new Exception("Missing take: "+name);
            return clips;
        }
        static AnimationClip Bake(AnimationClip input,string name,bool loop)
        {
            var rig=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/OliveTitan/Models/OliveTitan_LOD0.fbx"));
            var animator=rig.GetComponent<Animator>();animator.enabled=true;animator.applyRootMotion=false;
            animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;
            var samplingRig=Resources.Load<BlenderMotionSet>("Hero/OliveTitanMotion").SamplingRig;
            var samplePaths=samplingRig.GetComponentsInChildren<Transform>().ToDictionary(t=>t.name,t=>AnimationUtility.CalculateTransformPath(t,samplingRig.transform));
            var bones=rig.GetComponentsInChildren<Transform>().Where(t=>t!=rig.transform&&!t.GetComponent<Renderer>()&&t.name!="Root"&&samplePaths.ContainsKey(t.name)).ToArray();
            var graph=PlayableGraph.Create(name);graph.SetTimeUpdateMode(DirectorUpdateMode.Manual);
            try
            {
                var playable=AnimationClipPlayable.Create(graph,input);playable.SetApplyFootIK(false);playable.SetApplyPlayableIK(false);
                AnimationPlayableOutput.Create(graph,"Retarget",animator).SetSourcePlayable(playable);
                graph.Play();
                int frames=Mathf.CeilToInt(input.length*60);
                var curves=new AnimationCurve[bones.Length,7];
                for(int b=0;b<bones.Length;b++)for(int c=0;c<7;c++)curves[b,c]=new AnimationCurve();
                float minFoot=float.MaxValue,maxFoot=float.MinValue,forwardMin=999,forwardMax=-999;
                var leftFoot=animator.GetBoneTransform(HumanBodyBones.LeftFoot);var rightFoot=animator.GetBoneTransform(HumanBodyBones.RightFoot);
                for(int f=0;f<=frames;f++)
                {
                    float time=input.length*f/frames;
                    playable.SetTime(time);graph.Evaluate(0);
                    rig.transform.SetPositionAndRotation(Vector3.zero,Quaternion.identity);
                    minFoot=Mathf.Min(minFoot,leftFoot.position.y,rightFoot.position.y);maxFoot=Mathf.Max(maxFoot,leftFoot.position.y,rightFoot.position.y);
                    forwardMin=Mathf.Min(forwardMin,animator.GetBoneTransform(HumanBodyBones.Hips).position.z);forwardMax=Mathf.Max(forwardMax,animator.GetBoneTransform(HumanBodyBones.Hips).position.z);
                    for(int b=0;b<bones.Length;b++)
                    {
                        var p=bones[b].localPosition;var q=bones[b].localRotation;
                        float[] values={p.x,p.y,p.z,q.x,q.y,q.z,q.w};
                        for(int c=0;c<7;c++)curves[b,c].AddKey(time,values[c]);
                    }
                }
                var clip=new AnimationClip{name=name,frameRate=60};
                string[] properties={"localPosition.x","localPosition.y","localPosition.z","localRotation.x","localRotation.y","localRotation.z","localRotation.w"};
                for(int b=0;b<bones.Length;b++)for(int c=0;c<7;c++)
                {
                    float first=curves[b,c][0].value;
                    if(curves[b,c].keys.All(k=>Mathf.Abs(k.value-first)<.000001f))curves[b,c]=AnimationCurve.Linear(0,first,input.length,first);
                    for(int k=0;k<curves[b,c].length;k++){AnimationUtility.SetKeyLeftTangentMode(curves[b,c],k,AnimationUtility.TangentMode.Linear);AnimationUtility.SetKeyRightTangentMode(curves[b,c],k,AnimationUtility.TangentMode.Linear);}
                    clip.SetCurve(samplePaths[bones[b].name],typeof(Transform),properties[c],curves[b,c]);
                }
                clip.EnsureQuaternionContinuity();var settings=AnimationUtility.GetAnimationClipSettings(clip);settings.loopTime=loop;AnimationUtility.SetAnimationClipSettings(clip,settings);
                string path=Baked+name+".anim";var existing=AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
                if(existing){EditorUtility.CopySerialized(clip,existing);UnityEngine.Object.DestroyImmediate(clip);clip=existing;}else AssetDatabase.CreateAsset(clip,path);
                report.Add(name+" duration="+input.length.ToString("F3")+" bones="+bones.Length+" ankle="+minFoot.ToString("F3")+".."+maxFoot.ToString("F3")+" hipForward="+forwardMin.ToString("F3")+".."+forwardMax.ToString("F3"));
                return clip;
            }
            finally{graph.Destroy();UnityEngine.Object.DestroyImmediate(rig);}
        }
    }
}
