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
            string[] names={"Standing Taunt Battlecry","Zombie Punching","Mutant Jumping","Fast Run"};
            var clips=new[]{data.Transform,data.Punch,data.Jump,data.Run};
            Check(clips.Select(c=>c.name).SequenceEqual(names),"wrong FBX action mapping");
            Check(Mathf.Abs(data.Transform.length-HulkController.TransformDuration)<.002f&&Mathf.Abs(data.Punch.length-HulkController.PunchDuration)<.002f,"controller cuts off the original clip");
            var actor=new GameObject("Native test");var visual=HulkVisual.Create(actor.transform);
            Check(visual.GetComponent<HulkModelRetargeter>()==null,"old rig adapter still attached");
            Check(visual.Model.GetComponentInChildren<SkinnedMeshRenderer>().sharedMesh.name=="PumpkinHulk","old character still active");
            var native=UnityEngine.Object.Instantiate(data.Model);
            var reference=native.GetComponentsInChildren<Transform>().Where(t=>t.name.StartsWith("mixamorig:")).ToDictionary(t=>t.name);
            float maxAngle=0,maxOffset=0;
            foreach(float phase in new[]{.05f,.25f,.45f,.65f,.85f,.99f})
            foreach(bool transform in new[]{false,true})
            {
                var clip=transform?data.Transform:data.Punch;clip.SampleAnimation(native,phase*clip.length);
                visual.Pose(0,transform?HulkController.Attack.None:HulkController.Attack.Punch,phase*clip.length,true,false,transform?phase:-1,.2f);
                foreach(var bone in visual.MotionBones)
                {maxAngle=Mathf.Max(maxAngle,Quaternion.Angle(bone.localRotation,reference[bone.name].localRotation));maxOffset=Mathf.Max(maxOffset,Vector3.Distance(bone.localPosition,reference[bone.name].localPosition));}
                Check(visual.ActiveBlenderClip==clip,"wrong action selected");
            }
            Check(maxAngle<.1f&&maxOffset<.0001f,"native transform/punch joints changed: "+maxAngle+" / "+maxOffset);
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
                Check(contacts>=3&&contacts<=10,"unnatural stride frequency: "+contacts);
                Check(Mathf.Abs(actor.transform.position.z-speed*3)<.002f,"animation moves actor root");
                report+=$"{fps}fps speed={speed:F1}: distance={actor.transform.position.z-startZ:F2}m, stride={data.RunStride:F3}m, contacts={contacts}\n";
            }
            visual.SetMotion(Vector3.forward*2.7f,0,0);var knee=visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg");Quaternion old=knee.localRotation;float travel=0;
            for(int f=0;f<120;f++){visual.Pose(2.7f,HulkController.Attack.Punch,f/60f,true,false,-1,1f/60);travel=Mathf.Max(travel,Quaternion.Angle(old,knee.localRotation));}
            Check(travel>25,"moving attack freezes legs");
            UnityEngine.Object.DestroyImmediate(actor);UnityEngine.Object.DestroyImmediate(native);
            Directory.CreateDirectory("Logs");File.WriteAllText("Logs/native-mutant-validation.txt","PASS\n"+report+"Moving punch leg motion="+travel);Debug.Log("[Native mutant] PASS\n"+report);
        }
    }
}
