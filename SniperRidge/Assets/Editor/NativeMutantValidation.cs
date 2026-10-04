using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class NativeMutantValidation
    {
        static void Check(bool ok,string why){if(!ok)throw new Exception("Native mutant: "+why);}
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var data=Resources.Load<NativeMutantSet>(HulkVisual.Resource);Check(data&&data.Model,"missing native asset set");
            Check(data.Idle&&data.Hit&&data.Idle.name=="Fighting Idle"&&data.Hit.name=="Taking Punch","downloaded Mixamo actions missing");
            string[] names={"Standing Taunt Battlecry","Zombie Punching","Mutant Jumping","Fast Run"};
            var clips=new[]{data.Transform,data.Punch,data.Jump,data.Run};
            Check(clips.Select(c=>c.name).SequenceEqual(names),"wrong FBX action mapping");
            Check(Mathf.Abs(data.Transform.length-HulkController.TransformDuration)<.002f&&Mathf.Abs(data.Punch.length/HulkController.PunchPlaybackRate-HulkController.PunchDuration)<.002f,"controller cuts off the original clip");
            var actor=new GameObject("Native test");var visual=HulkVisual.Create(actor.transform);
            Check(visual.GetComponent<HulkModelRetargeter>()==null,"old rig adapter still attached");
            Check(data.Appearance&&visual.Model.GetComponent<KairosRig>().Ready,"Kairos appearance not active");
            var native=UnityEngine.Object.Instantiate(data.Model);
            var reference=native.GetComponentsInChildren<Transform>().Where(t=>t.name.StartsWith("mixamorig:")).ToDictionary(t=>t.name);
            float maxAngle=0,maxOffset=0;
            foreach(float phase in new[]{.05f,.25f,.45f,.65f,.85f,.99f})
            foreach(bool transform in new[]{false,true})
            {
                var clip=transform?data.Transform:data.Punch;clip.SampleAnimation(native,phase*clip.length);
                visual.Pose(0,transform?HulkController.Attack.None:HulkController.Attack.Punch,phase*clip.length/(transform?1:HulkController.PunchPlaybackRate),true,false,transform?phase:-1,.2f);
                foreach(var bone in visual.MotionBones)
                {maxAngle=Mathf.Max(maxAngle,Quaternion.Angle(bone.localRotation,reference[bone.name].localRotation));maxOffset=Mathf.Max(maxOffset,Vector3.Distance(bone.localPosition,reference[bone.name].localPosition));}
                Check(visual.ActiveBlenderClip==clip,"wrong action selected");
            }
            Check(maxAngle<.1f&&maxOffset<.0001f,"native transform/punch joints changed: "+maxAngle+" / "+maxOffset);
            // Source FBX bindings must target the same native bones (no silent unbound clips).
            foreach(var extra in new[]{data.Idle,data.Hit})
            foreach(var binding in AnimationUtility.GetCurveBindings(extra))
                Check(string.IsNullOrEmpty(binding.path)||visual.Model.transform.Find(binding.path)!=null,"Mixamo bone path mismatch: "+binding.path);
            visual.ResetLocomotion();visual.Pose(0,HulkController.Attack.None,0,true,false,-1,.2f);
            Check(visual.ActiveBlenderClip==data.Idle,"fighting idle not used");
            foreach(float sourceTime in new[]{.3f,.8f,1.2f,1.5f,1.8f,2.2f,3.1f})
            {
                bool airborne=sourceTime>data.JumpTakeoff&&sourceTime<data.JumpLanding;
                bool landed=sourceTime>=data.JumpLanding;
                float age=landed?(sourceTime-data.JumpLanding)/(data.Jump.length-data.JumpLanding)*HulkController.JumpRecovery:sourceTime/data.JumpTakeoff*HulkController.JumpWindup;
                float velocity=sourceTime<=data.JumpApex?HulkController.JumpLaunchSpeed*(1-Mathf.InverseLerp(data.JumpTakeoff,data.JumpApex,sourceTime)):-HulkController.JumpLaunchSpeed*Mathf.InverseLerp(data.JumpApex,data.JumpLanding,sourceTime);
                visual.SetJumpMotion(velocity,airborne);visual.Pose(0,HulkController.Attack.Slam,age,!airborne,landed,-1,.2f);data.Jump.SampleAnimation(native,sourceTime);
                foreach(var bone in visual.MotionBones)Check(Quaternion.Angle(bone.localRotation,reference[bone.name].localRotation)<.2f,"fast jump changed native joints: "+bone.name);
            }
            var report=$"Native mesh and four clips loaded. Transform/punch pose error: {maxAngle:F4}deg / {maxOffset:F6}m\n";
            foreach(int fps in new[]{30,60,120})
            foreach(float speed in new[]{HulkController.WalkSpeed,HulkController.RunSpeed})
            {
                visual.ResetLocomotion();actor.transform.position=Vector3.zero;
                int steps=visual.FootstepSerial;float startZ=0;
                for(int f=0;f<fps*3;f++)
                {
                    actor.transform.position+=Vector3.forward*speed/fps;visual.SetMotion(Vector3.forward*speed,0,0);visual.Pose(speed,HulkController.Attack.None,0,true,false,-1,1f/fps);
                    Check(visual.MotionBones.All(b=>!float.IsNaN(b.position.x)&&!float.IsInfinity(b.position.y)),"invalid bone transform");
                    if(f>fps)
                    {
                        float phase=Mathf.Repeat((f+1)*speed/fps/data.RunStride,1);data.Run.SampleAnimation(native,phase*data.Run.length);
                        foreach(var b in visual.MotionBones.Where(t=>t.name.Contains("Leg")||t.name.Contains("Foot")||t.name.Contains("Toe")))
                            Check(Quaternion.Angle(b.localRotation,reference[b.name].localRotation)<.2f,"running leg no longer matches original FBX: "+b.name);
                    }
                }
                int contacts=visual.FootstepSerial-steps;
                Check(contacts>=6&&contacts<=14,"unnatural stride frequency: "+contacts);
                Check(Mathf.Abs(actor.transform.position.z-speed*3)<.002f,"animation moves actor root");
                report+=$"{fps}fps speed={speed:F1}: distance={actor.transform.position.z-startZ:F2}m, stride={data.RunStride:F3}m, contacts={contacts}\n";
            }
            visual.SetMotion(Vector3.forward*2.7f,0,0);var knee=visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg");Quaternion old=knee.localRotation;float travel=0;
            for(int f=0;f<120;f++){visual.Pose(2.7f,HulkController.Attack.Punch,f/60f,true,false,-1,1f/60);travel=Mathf.Max(travel,Quaternion.Angle(old,knee.localRotation));}
            Check(travel>25,"moving attack freezes legs");
            // Hit reaction is upper-body only and expires without locking locomotion.
            visual.ResetLocomotion();visual.SetMotion(Vector3.forward*HulkController.WalkSpeed,0,0);
            visual.ReactToHit();visual.Pose(HulkController.WalkSpeed,HulkController.Attack.None,0,true,false,-1,.2f);
            Check(visual.ReactingToHit,"hit reaction missing");
            float hitPhase=Mathf.Repeat(HulkController.WalkSpeed*.2f/data.RunStride,1);data.Run.SampleAnimation(native,hitPhase*data.Run.length);
            foreach(var b in visual.MotionBones.Where(t=>t.name.Contains("Leg")||t.name.Contains("Foot")||t.name.Contains("Toe")))
                Check(Quaternion.Angle(b.localRotation,reference[b.name].localRotation)<.2f,"hit interrupts running legs");
            var head=visual.MotionBones.First(b=>b.name=="mixamorig:Head");
            Check(Quaternion.Angle(head.localRotation,reference[head.name].localRotation)>5,"hit has no visible head response");
            visual.Pose(0,HulkController.Attack.Punch,.2f,true,false,-1,.2f);Check(!visual.ReactingToHit,"hit overrides punch");
            visual.Pose(0,HulkController.Attack.None,0,true,false,-1,.5f);Check(!visual.ReactingToHit,"hit never ends");
            UnityEngine.Object.DestroyImmediate(actor);UnityEngine.Object.DestroyImmediate(native);
            Directory.CreateDirectory("Logs");File.WriteAllText("Logs/native-mutant-validation.txt","PASS\n"+report+"Moving punch leg motion="+travel);Debug.Log("[Native mutant] PASS\n"+report);
        }
    }
}
