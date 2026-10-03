using System;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class DownloadedHulkMotionValidation
    {
        static void Check(bool ok,string message){if(!ok)throw new Exception("Downloaded Hulk motion: "+message);}
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var player=new GameObject("Downloaded motion fixture");var visual=HulkVisual.Create(player.transform);
            var rig=visual.GetComponent<HulkModelRetargeter>().Character;
            var set=Resources.Load<BlenderMotionSet>("Hero/OliveTitanMotion");
            Check(visual.UsesAuthoredCombat&&set.Kick,"downloaded combat not wired");
            foreach(var clip in new[]{set.Run,set.PunchLeft,set.PunchRight,set.Kick})
                Check(AssetDatabase.GetAssetPath(clip).Contains("/Retargeted/Downloaded"),"old clip still active");
            var knee=rig.GetBoneTransform(HumanBodyBones.LeftLowerLeg);var foot=rig.GetBoneTransform(HumanBodyBones.LeftFoot);
            var hip=rig.GetBoneTransform(HumanBodyBones.Hips);var rest=knee.localRotation;
            float bend=0,lift=0,forward=0;
            for(int i=0;i<=90;i++)
            {
                float age=i/60f;
                visual.Pose(0,HulkController.Attack.Kick,age,true,false,-1,1f/60);
                Check(visual.ActiveBlenderClip==set.Kick,"kick clip not sampled");
                bend=Mathf.Max(bend,Quaternion.Angle(rest,knee.localRotation));
                lift=Mathf.Max(lift,foot.position.y);forward=Mathf.Max(forward,foot.position.z);
                Check(Mathf.Abs(hip.position.x)<.5f&&Mathf.Abs(hip.position.z)<.5f,"FBX root translation escaped player");
                Check(visual.transform.localPosition==Vector3.zero,"animation moved collision root");
                if(i==39)OliveTitanGameplayValidation.Capture(visual,"downloaded_kick_contact",false);
            }
            Check(bend>50&&lift>1.8f&&forward>.8f,"kick has no articulated wind-up/extension");
            for(int i=0;i<60;i++)visual.Pose(0,HulkController.Attack.None,0,true,false,-1,1f/60);
            Check(visual.ActiveBlenderClip==set.Idle&&foot.position.y<.3f,"kick failed to return to ground/idle");
            // A fresh loop must not snap the skeleton back to a different pose.
            var sample=UnityEngine.Object.Instantiate(set.SamplingRig);
            foreach(var animator in sample.GetComponentsInChildren<Animator>())animator.enabled=false;
            var bones=sample.GetComponentsInChildren<Transform>();
            set.Run.SampleAnimation(sample,0);var rotations=bones.Select(b=>b.localRotation).ToArray();var positions=bones.Select(b=>b.localPosition).ToArray();
            set.Run.SampleAnimation(sample,set.Run.length);
            float seam=bones.Select((b,i)=>Quaternion.Angle(b.localRotation,rotations[i])).Max();
            float seamPosition=bones.Select((b,i)=>Vector3.Distance(b.localPosition,positions[i])).Max();
            Check(seam<12&&seamPosition<.08f,"run loop seam: "+seam+"deg / "+seamPosition+"m");
            UnityEngine.Object.DestroyImmediate(sample);UnityEngine.Object.DestroyImmediate(player);
            string report=$"PASS: downloaded FBX clips, articulated kick, fixed player root, recovery, loop seam.\nKick knee={bend:F1}deg footHeight={lift:F2}m forward={forward:F2}m\nRun seam={seam:F2}deg / {seamPosition:F4}m\n";
            Directory.CreateDirectory("Logs");File.WriteAllText("Logs/downloaded-motion-validation.txt",report);Debug.Log(report);
        }
        public static void Preview()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var player=new GameObject("Downloaded motion preview");var visual=HulkVisual.Create(player.transform);
            for(int i=0;i<120;i++)
            {
                float time=i/15f,age=0,speed=0;var attack=HulkController.Attack.None;
                if(time<2.4f)speed=HulkController.WalkSpeed;
                else if(time<4.56f){attack=HulkController.Attack.Punch;age=(time-2.4f)%HulkController.PunchDuration;visual.PunchLeft=(int)((time-2.4f)/HulkController.PunchDuration)%2==1;}
                else if(time<6.06f){attack=HulkController.Attack.Kick;age=time-4.56f;}
                else if(time<7.5f){speed=2;attack=HulkController.Attack.Punch;age=(time-6.06f)%HulkController.PunchDuration;visual.PunchLeft=(int)((time-6.06f)/HulkController.PunchDuration)%2==1;}
                player.transform.position+=Vector3.forward*speed/15;
                visual.SetMotion(Vector3.forward*speed,0,0);visual.Pose(speed,attack,age,true,false,-1,1f/15);
                OliveTitanGameplayValidation.Capture(visual,"downloaded_motion_"+i.ToString("D3"),false);
            }
            UnityEngine.Object.DestroyImmediate(player);
        }
    }
}
