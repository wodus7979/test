using System.Linq;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    // Bake a single power clap directly on the supplied skeleton. Runtime uses only clip sampling.
    public static class NativeClapImport
    {
        public static void Run()
        {
            var set=Resources.Load<NativeMutantSet>(HulkVisual.Resource);
            var model=Object.Instantiate(set.Model);var bones=model.GetComponentsInChildren<Transform>().Where(t=>t.name.StartsWith("mixamorig:")).ToArray();
            Transform Bone(string name)=>bones.First(t=>t.name=="mixamorig:"+name);
            try
            {
                var curve=new AnimationCurve[bones.Length,7];for(int i=0;i<bones.Length;i++)for(int j=0;j<7;j++)curve[i,j]=new AnimationCurve();
                set.Block.SampleAnimation(model,0);var openFingers=bones.Select(b=>b.localRotation).ToArray();
                var clip=new AnimationClip{name="Native power clap",frameRate=60};
                for(int frame=0;frame<=60;frame++)
                {
                    float time=frame/60f;set.Idle.SampleAnimation(model,time*.3f);
                    float raise=Mathf.SmoothStep(0,1,Mathf.Clamp01(time/.22f));
                    float strike=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.25f,HulkController.ClapImpactTime,time));
                    float returnToIdle=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.57f,HulkController.ClapDuration,time));
                    float weight=raise*(1-returnToIdle);
                    var chest=Bone("Spine2");chest.rotation=Quaternion.AngleAxis(Mathf.Lerp(-7,9,strike)*weight,model.transform.right)*chest.rotation;
                    for(int i=0;i<bones.Length;i++)if(bones[i].name.Contains("Hand")&&!bones[i].name.EndsWith("Hand"))bones[i].localRotation=Quaternion.Slerp(bones[i].localRotation,openFingers[i],weight);
                    Vector3 shoulderCenter=model.transform.InverseTransformPoint((Bone("LeftArm").position+Bone("RightArm").position)*.5f);
                    float sharedReach=Mathf.Min(Vector3.Distance(Bone("LeftArm").position,Bone("LeftForeArm").position)+Vector3.Distance(Bone("LeftForeArm").position,Bone("LeftHand").position),Vector3.Distance(Bone("RightArm").position,Bone("RightForeArm").position)+Vector3.Distance(Bone("RightForeArm").position,Bone("RightHand").position));
                    foreach(string side in new[]{"Left","Right"})
                    {
                        float sign=side=="Left"?-1:1;var upper=Bone(side+"Arm");var elbow=Bone(side+"ForeArm");var hand=Bone(side+"Hand");
                        float reach=Vector3.Distance(upper.position,elbow.position)+Vector3.Distance(elbow.position,hand.position);
                        Vector3 shoulder=model.transform.InverseTransformPoint(upper.position);
                        Vector3 open=new Vector3(shoulder.x+sign*reach*.67f,shoulder.y-.12f,shoulder.z-.07f);
                        Vector3 meet=new Vector3(sign*.065f,shoulderCenter.y-.06f,shoulderCenter.z+sharedReach*.48f);
                        Vector3 target=Vector3.Lerp(hand.position,model.transform.TransformPoint(Vector3.Lerp(open,meet,strike)),weight);
                        Quaternion restingHand=hand.rotation;
                        EnemyAnimationRig.SolveLimb(upper,elbow,hand,target,upper.position+model.transform.right*(sign*reach)+Vector3.down*reach*.6f-model.transform.forward*reach*.2f);
                        var middle=Bone(side+"HandMiddle1");var index=Bone(side+"HandIndex1");var pinky=Bone(side+"HandPinky1");
                        Vector3 fingers=(middle.position-hand.position).normalized;
                        Vector3 palm=Vector3.Cross(index.position-pinky.position,fingers).normalized;
                        Quaternion authored=Quaternion.LookRotation(model.transform.up,model.transform.right*-sign)*Quaternion.Inverse(Quaternion.LookRotation(fingers,palm))*hand.rotation;
                        hand.rotation=Quaternion.Slerp(restingHand,authored,weight);
                    }
                    for(int i=0;i<bones.Length;i++)
                    {var p=bones[i].localPosition;var q=bones[i].localRotation;for(int j=0;j<3;j++)curve[i,j].AddKey(time,p[j]);for(int j=0;j<4;j++)curve[i,j+3].AddKey(time,q[j]);}
                }
                for(int i=0;i<bones.Length;i++)
                {
                    string path=AnimationUtility.CalculateTransformPath(bones[i],model.transform);
                    for(int j=0;j<3;j++)clip.SetCurve(path,typeof(Transform),"m_LocalPosition."+"xyz"[j],curve[i,j]);
                    for(int j=0;j<4;j++)clip.SetCurve(path,typeof(Transform),"m_LocalRotation."+"xyzw"[j],curve[i,j+3]);
                }
                clip.EnsureQuaternionContinuity();const string output="Assets/MutantCharacter/Clips/Native power clap.anim";
                var previous=AssetDatabase.LoadAssetAtPath<AnimationClip>(output);
                if(previous){EditorUtility.CopySerialized(clip,previous);Object.DestroyImmediate(clip);set.Clap=previous;}else{AssetDatabase.CreateAsset(clip,output);set.Clap=clip;}
                EditorUtility.SetDirty(set);AssetDatabase.SaveAssets();
            }
            finally{Object.DestroyImmediate(model);}
        }
    }
}
