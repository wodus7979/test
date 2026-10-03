using System;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEditor.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class HulkRenderedMotionValidation
    {
        static void Check(bool ok,string reason){if(!ok)throw new Exception("Rendered motion: "+reason);}
        static void ValidateHandBindings()
        {
            // Hand vertices must stay near their own finger axes after body sculpting.
            // A height-only pelvis mask previously displaced them by almost 10 cm.
            for(int lod=0;lod<3;lod++)
            {
                var model=UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>($"Assets/OliveTitan/Models/OliveTitan_LOD{lod}.fbx");
                foreach(var skin in model.GetComponentsInChildren<SkinnedMeshRenderer>())
                {
                    var mesh=skin.sharedMesh;var vertices=mesh.vertices;var weights=mesh.boneWeights;
                    for(int bone=0;bone<skin.bones.Length;bone++)
                    {
                        string name=skin.bones[bone].name;
                        if(!name.Contains("Hand")||name.EndsWith("Hand"))continue;
                        Vector3 center=Vector3.zero;float total=0;
                        for(int i=0;i<vertices.Length;i++)
                        {
                            var w=weights[i];float amount=(w.boneIndex0==bone?w.weight0:0)+(w.boneIndex1==bone?w.weight1:0)+(w.boneIndex2==bone?w.weight2:0)+(w.boneIndex3==bone?w.weight3:0);
                            if(amount<=.3f)continue;
                            center+=mesh.bindposes[bone].MultiplyPoint3x4(vertices[i])*amount;total+=amount;
                        }
                        if(total==0)continue;center/=total;
                        Check(new Vector2(center.x,center.z).magnitude<.035f,$"LOD{lod} {name} mesh detached from finger axis: {center}");
                    }
                }
            }
        }
        public static void Run()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=Vector3.down*.1f;floor.transform.localScale=new Vector3(300,.2f,300);Physics.SyncTransforms();
            ValidateHandBindings();
            string report="";
            foreach(int fps in new[]{30,60,120})
            foreach(float speed in new[]{0f,2.7f})
            {
                var p=new GameObject("Visible rig test");var v=HulkVisual.Create(p.transform);var a=v.GetComponent<HulkModelRetargeter>().Character;
                foreach(bool left in new[]{false,true})
                {
                    var upper=a.GetBoneTransform(left?HumanBodyBones.LeftUpperArm:HumanBodyBones.RightUpperArm);
                    var elbow=a.GetBoneTransform(left?HumanBodyBones.LeftLowerArm:HumanBodyBones.RightLowerArm);
                    var hand=a.GetBoneTransform(left?HumanBodyBones.LeftHand:HumanBodyBones.RightHand);
                    var knuckle=a.GetBoneTransform(left?HumanBodyBones.LeftMiddleProximal:HumanBodyBones.RightMiddleProximal);
                    float arm=Vector3.Distance(upper.position,elbow.position),forearm=Vector3.Distance(elbow.position,hand.position);
                    v.PunchLeft=left;
                    for(int f=0;f<Mathf.CeilToInt(HulkController.PunchImpactTime*fps);f++)
                    {p.transform.position+=Vector3.forward*speed/fps;v.SetMotion(Vector3.forward*speed,0,0);v.Pose(speed,HulkController.Attack.Punch,f/(float)fps,true,false,-1,1f/fps);}
                    v.Pose(speed,HulkController.Attack.Punch,HulkController.PunchImpactTime,true,false,-1,1f/fps);
                    float reach=Vector3.Dot(hand.position-upper.position,p.transform.forward);
                    float bend=Vector3.Angle(elbow.position-upper.position,hand.position-elbow.position);
                    float wrist=Vector3.Angle(hand.position-elbow.position,knuckle.position-hand.position);
                    Check(reach>(arm+forearm)*.95f,"fist does not reach toward opponent: "+reach);
                    Check(bend<28,"punch elbow remains folded: "+bend);
                    Check(wrist<8,"wrist bent away from forearm: "+wrist);
                    Check(Mathf.Abs(Vector3.Distance(upper.position,elbow.position)-arm)<.002f&&Mathf.Abs(Vector3.Distance(elbow.position,hand.position)-forearm)<.002f,"punch stretches bones");
                    if(fps==60&&speed==0)OliveTitanGameplayValidation.Capture(v,"corrected_punch_"+(left?"left":"right"),false);
                    for(float t=HulkController.PunchImpactTime;t<=HulkController.PunchDuration;t+=1f/fps)v.Pose(speed,HulkController.Attack.Punch,t,true,false,-1,1f/fps);
                    Check(Vector3.Dot(hand.position-upper.position,p.transform.forward)<reach-.3f,"fist fails to recover");
                    report+=$"{fps}fps speed={speed} left={left} forward={reach:F3}m elbowBend={bend:F2} wrist={wrist:F2}\n";
                }
                UnityEngine.Object.DestroyImmediate(p);
            }
            foreach(float speed in new[]{3.2f,6.4f})
            {
                var p=new GameObject("Run feet test");var v=HulkVisual.Create(p.transform);var a=v.GetComponent<HulkModelRetargeter>().Character;
                var feet=new[]{a.GetBoneTransform(HumanBodyBones.LeftFoot),a.GetBoneTransform(HumanBodyBones.RightFoot)};
                float min=100,max=-100,slip=0;var previous=feet.Select(t=>t.position).ToArray();
                for(int f=0;f<180;f++)
                {
                    p.transform.position+=Vector3.forward*speed/60;v.SetMotion(Vector3.forward*speed,0,0);v.Pose(speed,HulkController.Attack.None,0,true,false,-1,1f/60);
                    foreach(var foot in feet){min=Mathf.Min(min,foot.position.y);max=Mathf.Max(max,foot.position.y);}
                    for(int i=0;i<2;i++){if(f>60&&feet[i].position.y<.13f&&previous[i].y<.13f)slip=Mathf.Max(slip,Vector3.Distance(previous[i],feet[i].position));previous[i]=feet[i].position;}
                }
                Check(min>.02f&&min<.18f,"run never contacts ground: "+min);Check(max<.67f,"ankle lifts too high: "+max);
                Check(slip<.10f,"planted foot slides: "+slip);
                report+=$"run {speed}m/s ankle={min:F3}..{max:F3}m supportSlip={slip:F3}m\n";
                UnityEngine.Object.DestroyImmediate(p);
            }
            File.WriteAllText("Logs/hulk-rendered-motion.txt","PASS\n"+report);Debug.Log("[Rendered motion] PASS\n"+report);
        }
    }
}
