using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class HulkRunIntegrationValidation
    {
        static void Check(bool ok,string message){if(!ok)throw new Exception("Authored Hulk run: "+message);}
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=Vector3.down*.1f;floor.transform.localScale=new Vector3(100,.2f,100);
            var player=new GameObject("Run validation player");var visual=HulkVisual.Create(player.transform);
            var data=Resources.Load<BlenderMotionSet>("Hero/OliveTitanMotion");
            Check(visual.UsesFullBodyRun && data.Run,"full-body clip not wired");
            Check(AssetDatabase.GetAssetPath(data.Run).EndsWith("DownloadedRun.anim"),"downloaded Running FBX not wired");
            Check(Mathf.Abs(data.Run.length-.7f)<.04f,"downloaded run cycle duration changed");
            var character=visual.GetComponent<HulkModelRetargeter>().Character;
            var targets=character.GetComponentsInChildren<Transform>().Where(t=>!t.IsChildOf(character.transform.Find("Blender motion sampler"))).ToDictionary(t=>t.name);
            var sampler=UnityEngine.Object.Instantiate(data.SamplingRig);
            foreach(var a in sampler.GetComponentsInChildren<Animator>())a.enabled=false;
            var reference=sampler.GetComponentsInChildren<Transform>().ToDictionary(t=>t.name);
            var phaseField=typeof(HulkVisual).GetField("gaitPhase",BindingFlags.NonPublic|BindingFlags.Instance);
            var report="";float normalCycles=0,sprintCycles=0;
            foreach(float speed in new[]{HulkController.WalkSpeed,HulkController.RunSpeed})
            {
                visual.ResetLocomotion();
                for(int i=0;i<60;i++){visual.SetMotion(Vector3.forward*speed,0,0);visual.Pose(speed,HulkController.Attack.None,0,true,false,-1,1f/60);}
                float start=(float)phaseField.GetValue(visual);float maxAngle=0,maxPosition=0,minFoot=100;int steps=visual.FootstepSerial;
                for(int i=0;i<60;i++)
                {
                    player.transform.position+=Vector3.forward*speed/60;
                    visual.SetMotion(Vector3.forward*speed,0,0);visual.Pose(speed,HulkController.Attack.None,0,true,false,-1,1f/60);
                    float phase=Mathf.Repeat((float)phaseField.GetValue(visual),1);data.Run.SampleAnimation(sampler,phase*data.Run.length);
                    Check(visual.ActiveBlenderClip==data.Run && visual.Motion=="Run","moving did not use latest run");
                    foreach(string name in new[]{"Hips","Spine","Chest","UpperChest","LeftShoulder","RightShoulder","LeftUpperArm","RightUpperArm","LeftLowerArm","RightLowerArm","LeftHand","RightHand","LeftUpperLeg","RightUpperLeg","LeftLowerLeg","RightLowerLeg","LeftFoot","RightFoot"})
                    {
                        maxAngle=Mathf.Max(maxAngle,Quaternion.Angle(targets[name].localRotation,reference[name].localRotation));
                        maxPosition=Mathf.Max(maxPosition,Vector3.Distance(targets[name].localPosition,reference[name].localPosition));
                    }
                    minFoot=Mathf.Min(minFoot,targets["LeftFoot"].position.y-player.transform.position.y,targets["RightFoot"].position.y-player.transform.position.y);
                }
                float cycles=(float)phaseField.GetValue(visual)-start;
                if(speed==HulkController.WalkSpeed)normalCycles=cycles;else sprintCycles=cycles;
                Check(maxAngle<.15f && maxPosition<.001f,"whole-body pose differs from authored clip: "+maxAngle+"deg / "+maxPosition+"m");
                Check(minFoot>-.03f,"feet below player ground");
                Check(visual.FootstepSerial>steps,"authored contact phases did not produce footsteps");
                report+=$"speed={speed:F2}m/s cycles={cycles:F3}/s rotationError={maxAngle:F4}deg positionError={maxPosition:F5}m minAnkle={minFoot:F3}m\n";
                OliveTitanGameplayValidation.Capture(visual,speed==HulkController.WalkSpeed?"hulk_new_run":"hulk_new_sprint",true);
            }
            Check(Mathf.Abs(sprintCycles/normalCycles-2)<.02f,"sprint animation did not speed up 2x");
            for(int i=0;i<120;i++){visual.SetMotion(Vector3.zero,0,0);visual.Pose(0,HulkController.Attack.None,0,true,false,-1,1f/60);}
            Check(visual.Motion=="Idle"&&visual.ActiveBlenderClip==data.Idle,"stop did not restore idle");
            int stoppedSteps=visual.FootstepSerial;
            for(int i=0;i<60;i++)visual.Pose(0,HulkController.Attack.None,0,true,false,-1,1f/60);
            Check(stoppedSteps==visual.FootstepSerial,"footsteps continued while stationary");
            foreach(Vector3 direction in new[]{Vector3.back,Vector3.left,Vector3.right})
            {
                for(int i=0;i<60;i++){visual.SetMotion(direction*HulkController.WalkSpeed,0,0);visual.Pose(HulkController.WalkSpeed,HulkController.Attack.None,0,true,false,-1,1f/60);}
                Check(Vector3.Dot(visual.transform.forward,direction)>.99f,"model does not face travel direction");
            }
            UnityEngine.Object.DestroyImmediate(sampler);
            Directory.CreateDirectory("Logs");File.WriteAllText("Logs/hulk-authored-run.txt","PASS\n"+report);
            Debug.Log("[Authored Hulk run] PASS\n"+report);
        }
    }
}
