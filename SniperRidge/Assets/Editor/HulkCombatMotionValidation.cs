using System;
using System.IO;
using System.Linq;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class HulkCombatMotionValidation
    {
        static void Check(bool ok,string message){if(!ok)throw new Exception("Combat footwork: "+message);}
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=Vector3.down*.1f;floor.transform.localScale=new Vector3(200,.2f,200);
            Physics.SyncTransforms();string report="";
            foreach(int fps in new[]{30,60,120})
            foreach(var attack in new[]{HulkController.Attack.Punch,HulkController.Attack.Clap})
            foreach(float speed in new[]{0f,2.0f})
            {
                var player=new GameObject("Combat motion fixture");var visual=HulkVisual.Create(player.transform);
                var rig=visual.GetComponent<HulkModelRetargeter>().Character;
                var hips=rig.GetBoneTransform(HumanBodyBones.Hips);
                var knees=new[]{rig.GetBoneTransform(HumanBodyBones.LeftLowerLeg),rig.GetBoneTransform(HumanBodyBones.RightLowerLeg)};
                var thighs=new[]{rig.GetBoneTransform(HumanBodyBones.LeftUpperLeg),rig.GetBoneTransform(HumanBodyBones.RightUpperLeg)};
                var feet=new[]{rig.GetBoneTransform(HumanBodyBones.LeftFoot),rig.GetBoneTransform(HumanBodyBones.RightFoot)};
                for(int i=0;i<fps;i++)visual.Pose(0,HulkController.Attack.None,0,true,false,-1,1f/fps);
                float[] a=Enumerable.Range(0,2).Select(j=>Vector3.Distance(thighs[j].position,knees[j].position)).ToArray();
                float[] b=Enumerable.Range(0,2).Select(j=>Vector3.Distance(knees[j].position,feet[j].position)).ToArray();
                var minK=new[]{180f,180f};var maxK=new[]{0f,0f};float minHip=100,maxHip=0,minFoot=100,maxFoot=0,maxSlip=0;
                var oldFeet=feet.Select(f=>f.position).ToArray();int movingSteps=visual.FootstepSerial;
                float duration=attack==HulkController.Attack.Punch?HulkController.PunchDuration:.95f;
                for(int i=0;i<Mathf.CeilToInt(duration*3*fps);i++)
                {
                    float age=(i/(float)fps)%duration;visual.PunchLeft=i/(float)fps>=duration;
                    player.transform.position+=Vector3.forward*speed/fps;
                    visual.SetMotion(Vector3.forward*speed,0,0);visual.Pose(speed,attack,age,true,false,-1,1f/fps);
                    minHip=Mathf.Min(minHip,hips.position.y);maxHip=Mathf.Max(maxHip,hips.position.y);
                    for(int j=0;j<2;j++)
                    {
                        float angle=Vector3.Angle(knees[j].position-thighs[j].position,feet[j].position-knees[j].position);
                        minK[j]=Mathf.Min(minK[j],angle);maxK[j]=Mathf.Max(maxK[j],angle);
                        minFoot=Mathf.Min(minFoot,feet[j].position.y);maxFoot=Mathf.Max(maxFoot,feet[j].position.y);
                        Check(Mathf.Abs(Vector3.Distance(thighs[j].position,knees[j].position)-a[j])<.003f,"upper leg stretched");
                        Check(Mathf.Abs(Vector3.Distance(knees[j].position,feet[j].position)-b[j])<.003f,"shin stretched");
                        if(i>fps/3&&feet[j].position.y<.112f&&oldFeet[j].y<.112f)
                            maxSlip=Mathf.Max(maxSlip,Vector3.Distance(feet[j].position,oldFeet[j]));
                        oldFeet[j]=feet[j].position;
                    }
                    if(fps==60 && i==Mathf.RoundToInt((attack==HulkController.Attack.Punch?.26f:.4f)*fps))
                        OliveTitanGameplayValidation.Capture(visual,$"combat_{attack}_{(speed>0?"moving":"standing")}",false);
                }
                Check(maxK[0]-minK[0]>6&&maxK[1]-minK[1]>6,"knees frozen "+attack+" speed="+speed);
                Check(maxHip-minHip>.018f,"pelvis frozen");Check(minFoot>-.035f,"ankle below floor: "+minFoot);
                if(speed>0){Check(visual.FootstepSerial>movingSteps,"attack gait does not trigger steps");Check(maxFoot>.18f,"feet slide instead of stepping");Check(maxSlip<.10f,"support foot slides: "+maxSlip);}
                report+=$"{fps}fps {attack} speed={speed:F1} knees={maxK[0]-minK[0]:F1}/{maxK[1]-minK[1]:F1}deg hipTravel={maxHip-minHip:F3}m ankle={minFoot:F3}..{maxFoot:F3} supportStep={maxSlip:F3}m\n";
                // Return to authored run after repeated attacks, without carrying their bone offsets.
                for(int i=0;i<fps;i++){visual.SetMotion(Vector3.forward*3.2f,0,0);visual.Pose(3.2f,HulkController.Attack.None,0,true,false,-1,1f/fps);}
                Check(visual.ActiveBlenderClip==Resources.Load<BlenderMotionSet>("Hero/OliveTitanMotion").Run,"attack never returned to run");
                UnityEngine.Object.DestroyImmediate(player);
            }
            var transformationPlayer=new GameObject("Transform fixture");var v=HulkVisual.Create(transformationPlayer.transform);
            for(int i=0;i<=108;i++)
            {
                v.Pose(0,HulkController.Attack.None,0,true,false,i/108f,1f/60);
                if(i==25||i==65||i==108)OliveTitanGameplayValidation.Capture(v,"combat_transform_"+i,false);
            }
            Directory.CreateDirectory("Logs");File.WriteAllText("Logs/hulk-combat-motion.txt","PASS\n"+report);
            Debug.Log("[Combat footwork] PASS\n"+report);
            OliveTitanGameplayValidation.Run();
            HulkRunIntegrationValidation.Run();
        }
    }
}
