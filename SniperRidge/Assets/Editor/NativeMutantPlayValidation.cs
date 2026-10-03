using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;

namespace SniperRidge.EditorTools
{
    // An isolated Play-mode test. Exercises the same UI handlers and controller as keyboard play.
    [InitializeOnLoad]
    public static class NativeMutantPlayValidation
    {
        const string Key="NativeMutant.PlayValidation";
        static int stage,lastFrame=-1,landings,recordFrame;
        static float at,peak,nextRecord,kneeMotion;
        static Vector3 city,start,arena=new Vector3(1500,40.05f,1500);
        static Vector2 move;
        static bool sprint,contactShot,jumpShot;
        static Quaternion kneeStart;
        static HulkController h;
        static GameObject floor;
        static EnemySoldier enemy;
        static NativeMutantPlayValidation(){EditorApplication.update+=Poll;}
        public static void Run()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.Delete("Logs/autoplay_result.txt");File.Delete("Logs/native-mutant-play.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=65\ntag=native_mutant\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Check(bool ok,string why){if(!ok)throw new Exception("Native mutant Play: "+why);}
        static void Next(){stage++;at=Time.time;}
        static void Teleport(SniperController p,Vector3 position)
        {var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(position,Quaternion.identity);c.enabled=true;Physics.SyncTransforms();}
        static void Freeze(EnemySoldier e)
        {e.enabled=false;if(e.Combat)e.Combat.enabled=false;var n=e.GetComponent<AssaultNavigation>();if(n)n.enabled=false;var a=e.GetComponent<NavMeshAgent>();if(a)a.enabled=false;}
        static void Record(string name)
        {
            var camera=GameManager.Instance.PlayerEye.GetComponent<Camera>();var previous=camera.targetTexture;var old=RenderTexture.active;
            var rt=new RenderTexture(640,400,24);var image=new Texture2D(640,400,TextureFormat.RGB24,false);
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,640,400),0,0);image.Apply();Directory.CreateDirectory("Screenshots/native_game");File.WriteAllBytes("Screenshots/native_game/"+name+".png",image.EncodeToPNG());}
            finally{camera.targetTexture=previous;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);}
        }
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            if(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)>180){Debug.LogError("Native Play timed out at stage "+stage);SessionState.SetBool(Key,false);EditorApplication.Exit(2);return;}
            try
            {
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm&&gm.IsPlaying&&gm.Assault!=null)
                {
                    if(lastFrame==Time.frameCount)return;lastFrame=Time.frameCount;
                    var p=gm.Player;float age=Time.time-at;
                    if(h&&h.Active){h.Move(move,Time.deltaTime,sprint);h.Tick(0);}
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        h=p.Hulk;p.enabled=false;city=p.transform.position;
                        // Freeze the combat fixture and its delayed AI diagnostic together.
                        gm.Assault.StopAllCoroutines();foreach(var soldier in gm.Assault.Soldiers)Freeze(soldier);gm.Assault.enabled=false;gm.Health.Max=10000;gm.Health.Configure(0,10000);
                        h.GetComponentsInChildren<Button>().First(b=>b.name=="Transform").onClick.Invoke();
                        Check(h.Active&&h.Transforming,"H/transform UI did not start");Check(gm.Health.Max==20000,"health not doubled");
                        Check(h.Visual.Definition&&h.Visual.Model.GetComponentInChildren<SkinnedMeshRenderer>().sharedMesh.name=="PumpkinHulk","old model still loaded");Next();
                    }
                    else if(stage==1)
                    {
                        if(age<HulkController.TransformDuration-.05f){Check(h.Visual.Motion=="Transform"&&h.Visual.ActiveBlenderClip==h.Visual.Definition.Transform,"taunt missing during transformation");Check(!h.BeginAttack(HulkController.Attack.Punch),"attack interrupts taunt");}
                        if(age>1.2f&&!contactShot){Record("transform");contactShot=true;}
                        if(age<HulkController.TransformDuration+.25f)return;
                        Check(!h.Transforming,"taunt did not finish");
                        floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=arena+Vector3.down*.55f;floor.transform.localScale=new Vector3(100,1,100);
                        Teleport(p,arena);enemy=LevelBuilder.SpawnAssaultSoldier(gm,AssaultLayout.Start,true,1991,EnemyRole.MachineGunner,false);gm.Assault.Soldiers.Add(enemy);Freeze(enemy);enemy.transform.position=arena+Vector3.forward*2.5f;typeof(EnemySoldier).GetProperty("Health").SetValue(enemy,1000f);Physics.SyncTransforms();Next();
                    }
                    else if(stage==2&&age>.3f){Check(h.BeginAttack(HulkController.Attack.Punch),"punch rejected");contactShot=false;Next();}
                    else if(stage==3)
                    {
                        if(age<HulkController.PunchImpactTime-.08f)Check(enemy.Health==1000,"damage precedes the FBX strike");
                        Check(h.Visual.ActiveBlenderClip==h.Visual.Definition.Punch||age>HulkController.PunchDuration,"wrong punch clip");
                        if(age>HulkController.PunchImpactTime&&!contactShot){Record("punch_contact");contactShot=true;}
                        if(age<HulkController.PunchDuration+.2f)return;
                        Check(Mathf.Abs(enemy.Health-855)<.1f,"punch must hit once: "+enemy.Health);Check(h.Audio.Count(HulkAudio.Cue.PunchSwing)==1&&h.Audio.Count(HulkAudio.Cue.PunchHit)==1,"punch audio events wrong");
                        start=p.transform.position;move=Vector2.left;Next();
                    }
                    else if(stage==4&&age>1.5f)
                    {Check(h.Visual.ActiveBlenderClip==h.Visual.Definition.Run&&h.PlanarSpeed>3,"Fast Run missing");Check(Vector3.Distance(start,p.transform.position)>3,"normal run does not move");Record("run");sprint=true;start=p.transform.position;Next();}
                    else if(stage==5&&age>1.5f)
                    {
                        Check(h.Sprinting&&h.PlanarSpeed>6.1f&&Vector3.Distance(start,p.transform.position)>7,"fast run is not faster");Record("sprint");sprint=false;
                        Check(h.BeginAttack(HulkController.Attack.Punch),"moving punch rejected");kneeStart=h.Visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg").localRotation;start=p.transform.position;Next();
                    }
                    else if(stage==6)
                    {
                        kneeMotion=Mathf.Max(kneeMotion,Quaternion.Angle(kneeStart,h.Visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg").localRotation));
                        if(age<HulkController.PunchDuration+.2f)return;
                        Check(kneeMotion>25&&Vector3.Distance(start,p.transform.position)>5,"moving punch freezes legs/root");move=Vector2.zero;
                        Teleport(p,arena+Vector3.right*20);enemy.transform.position=p.transform.position+Vector3.forward*2;typeof(EnemySoldier).GetProperty("Health").SetValue(enemy,1000f);Physics.SyncTransforms();Next();
                    }
                    else if(stage==7&&age>.3f){start=p.transform.position;landings=h.Landings;peak=0;Check(h.BeginAttack(HulkController.Attack.Slam),"jump rejected");Next();}
                    else if(stage==8)
                    {
                        peak=Mathf.Max(peak,p.transform.position.y-start.y);
                        if(age<1.1f)Check(!h.JumpLaunched&&Mathf.Abs(p.transform.position.y-start.y)<.05f,"jump launches before source wind-up");
                        if(h.JumpLaunched&&!jumpShot&&Mathf.Abs(h.JumpVelocity)<1.5f){Record("jump_apex");jumpShot=true;}
                        if(h.CurrentAttack!=HulkController.Attack.None){Check(age<5,"jump stuck");return;}
                        Check(h.Landings==landings+1&&peak>.4f&&peak<1.1f,"jump physics or single landing wrong: "+peak);Check(Mathf.Abs(enemy.Health-800)<.1f,"landing damage missing/repeated");
                        Check(h.Audio.Count(HulkAudio.Cue.Jump)==1&&h.Audio.Count(HulkAudio.Cue.Slam)==1,"jump/landing audio wrong");Record("landing");
                        Check(h.Toggle()&&!p.IsHulk&&gm.Health.Max==10000,"FPS/health restore failed");
                        gm.Assault.Soldiers.Remove(enemy);UnityEngine.Object.Destroy(enemy.gameObject);floor.SetActive(false);UnityEngine.Object.Destroy(floor);Teleport(p,city);Next();
                    }
                    else if(stage==9&&age>.3f){Check(h.Toggle(),"city transformation failed");nextRecord=0;Next();}
                    else if(stage==10)
                    {
                        if(Time.time>nextRecord){Record("frame_"+(recordFrame++).ToString("D3"));nextRecord=Time.time+.08f;}
                        if(age<HulkController.TransformDuration+.2f)return;
                        move=Vector2.up;sprint=true;Next();
                    }
                    else if(stage==11)
                    {
                        if(Time.time>nextRecord){Record("frame_"+(recordFrame++).ToString("D3"));nextRecord=Time.time+.08f;}
                        if(age<1.7f)return;move=Vector2.zero;sprint=false;Check(h.BeginAttack(HulkController.Attack.Punch),"city punch failed");Next();
                    }
                    else if(stage==12)
                    {
                        if(Time.time>nextRecord){Record("frame_"+(recordFrame++).ToString("D3"));nextRecord=Time.time+.08f;}
                        if(age<HulkController.PunchDuration+.2f)return;Check(h.BeginAttack(HulkController.Attack.Slam),"city jump failed");Next();
                    }
                    else if(stage==13)
                    {
                        if(Time.time>nextRecord){Record("frame_"+(recordFrame++).ToString("D3"));nextRecord=Time.time+.08f;}
                        if(h.CurrentAttack!=HulkController.Attack.None)return;
                        p.enabled=true;File.WriteAllText("Logs/native-mutant-play.txt","PASS: supplied character; H taunt; native punch once at contact with audio; Fast Run normal/sprint; moving punch leg motion; jump wind-up/flight/single landing/audio; double health and FPS restore.\nJump height="+peak+"m; moving knee travel="+kneeMotion+"deg\n");Debug.Log("[Native mutant Play] PASS");stage=99;
                    }
                }
                if(!File.Exists("Logs/autoplay_result.txt")||EditorApplication.isPlayingOrWillChangePlaymode)return;
                string result=File.ReadAllText("Logs/autoplay_result.txt");SessionState.SetBool(Key,false);EditorApplication.Exit(stage==99&&result.Contains("errors=0")&&result.Contains("status=완료")?0:3);
            }
            catch(Exception ex){Debug.LogException(ex);SessionState.SetBool(Key,false);EditorApplication.Exit(4);}
        }
    }
}
