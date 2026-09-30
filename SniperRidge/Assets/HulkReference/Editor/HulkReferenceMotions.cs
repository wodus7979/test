using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
namespace HulkReferenceAssets
{
    // Additional clips use the supplied Generic skeleton, not a second character model.
    public static class HulkReferenceMotions
    {
        static AnimationCurve Compact(AnimationCurve curve)
        {
            var keys=curve.keys;bool constant=true;
            for(int i=1;i<keys.Length;i++)if(Mathf.Abs(keys[i].value-keys[0].value)>0.000001f){constant=false;break;}
            return constant?AnimationCurve.Constant(keys[0].time,keys[keys.Length-1].time,keys[0].value):curve;
        }
        public static AnimationClip Build(string name,string[] paths,Transform[] bones,Dictionary<string,int> ids,string output)
        {
            float length=name=="Transform"?1.8f:name=="Clap"?.95f:name=="Land"?.6f:1f;
            int frames=Mathf.CeilToInt(length*30);
            var rotations=new AnimationCurve[bones.Length,4];
            for(int b=0;b<bones.Length;b++)for(int k=0;k<4;k++)rotations[b,k]=new AnimationCurve();
            var hip=new AnimationCurve();
            for(int frame=0;frame<=frames;frame++)
            {
                float time=length*frame/frames,t=time/length,crouch=0;var pose=new Dictionary<string,Vector3>();
                if(name=="Transform")
                {
                    crouch=1-Mathf.SmoothStep(0,1,Mathf.Clamp01((t-.22f)/.43f));
                    float flex=Mathf.Sin(Mathf.Clamp01((t-.25f)/.75f)*Mathf.PI);
                    pose["Chest"]=new Vector3(25*crouch-9*flex,0,0);pose["Head"]=new Vector3(10*crouch-20*flex,0,0);
                    pose["LeftUpperArm"]=new Vector3(-20*flex,0,36*flex);pose["RightUpperArm"]=new Vector3(-20*flex,0,-36*flex);
                    pose["LeftForearm"]=pose["RightForearm"]=new Vector3(-85*flex,0,0);
                    foreach(var b in bones)if(b.name.Contains("Prox"))pose[b.name]=new Vector3(-55*flex,0,0);else if(b.name.Contains("Dist"))pose[b.name]=new Vector3(-70*flex,0,0);
                }
                else if(name=="Clap")
                {
                    float open=Mathf.SmoothStep(0,1,Mathf.Clamp01(time/.19f));
                    float close=Mathf.SmoothStep(0,1,Mathf.Clamp01((time-.19f)/.24f));
                    float hold=1-Mathf.SmoothStep(0,1,Mathf.Clamp01((time-.62f)/.33f));
                    pose["Chest"]=new Vector3(8*close*hold,0,0);
                    pose["LeftUpperArm"]=new Vector3(-82*close*hold,-40*close*hold,55*open*(1-close)*hold);
                    pose["RightUpperArm"]=new Vector3(-82*close*hold,40*close*hold,-55*open*(1-close)*hold);
                    pose["LeftForearm"]=pose["RightForearm"]=new Vector3(-20*close*hold,0,0);
                }
                else if(name=="Air")
                {
                    crouch=.6f;pose["Chest"]=new Vector3(10,0,0);
                    pose["LeftUpperArm"]=pose["RightUpperArm"]=new Vector3(-145,0,0);
                    pose["LeftForearm"]=pose["RightForearm"]=new Vector3(-30,0,0);
                }
                else if(name=="Land")
                {
                    crouch=1-Mathf.SmoothStep(0,1,t);
                    pose["Chest"]=new Vector3(32*crouch,0,0);
                    pose["LeftUpperArm"]=pose["RightUpperArm"]=new Vector3(-50*crouch,0,0);
                }
                foreach(string side in new[]{"Left","Right"})
                {pose[side+"Thigh"]=new Vector3(-43*crouch,0,0);pose[side+"Calf"]=new Vector3(86*crouch,0,0);pose[side+"Foot"]=new Vector3(-43*crouch,0,0);}
                hip.AddKey(time,1.2259335f-(name=="Air"?0:.28f*crouch));
                for(int b=0;b<bones.Length;b++)
                {
                    Quaternion q=Quaternion.Euler(pose.TryGetValue(bones[b].name,out var euler)?euler:Vector3.zero);
                    for(int k=0;k<4;k++)rotations[b,k].AddKey(time,q[k]);
                }
            }
            var clip=new AnimationClip{name=name,frameRate=30};
            for(int b=0;b<bones.Length;b++)for(int k=0;k<4;k++)AnimationUtility.SetEditorCurve(clip,EditorCurveBinding.FloatCurve(paths[b],typeof(Transform),"m_LocalRotation."+"xyzw"[k]),Compact(rotations[b,k]));
            for(int k=0;k<3;k++)AnimationUtility.SetEditorCurve(clip,EditorCurveBinding.FloatCurve(paths[ids["Hips"]],typeof(Transform),"m_LocalPosition."+"xyz"[k]),k==1?hip:AnimationCurve.Constant(0,length,0));
            clip.EnsureQuaternionContinuity();var settings=AnimationUtility.GetAnimationClipSettings(clip);settings.loopTime=name=="Air";AnimationUtility.SetAnimationClipSettings(clip,settings);
            string path=output+"/Animations/"+name+".anim";var old=AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
            if(old!=null){EditorUtility.CopySerialized(clip,old);Object.DestroyImmediate(clip);return old;}
            AssetDatabase.CreateAsset(clip,path);return clip;
        }
    }
}
