using System;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;

namespace SniperRidge.EditorTools
{
    /// <summary>Run only in an isolated project: -executeMethod SniperRidge.EditorTools.HulkValidation.Run</summary>
    [InitializeOnLoad]
    public static class HulkValidation
    {
        const string Key="Hulk.Validation";
        static int stage,ammo,landings,lastFrame=-1;
        static float at,peak,allyHealth,initialScale;
        static bool transformCaptured,punchCaptured;
        static Quaternion restingArm;
        static Vector3 cityPosition,origin=new Vector3(1500,40.05f,1500),beforeMove;
        static GameObject fixture,ceiling;
        static EnemySoldier front,far,protectedEnemy,ally;
        static HulkController h;
        static HulkValidation(){EditorApplication.update+=Poll;}
        public static void Run()
        {
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");
            Directory.CreateDirectory("Logs");File.Delete("Logs/autoplay_result.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=35\ntag=hulk\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Check(bool ok,string message){if(!ok)throw new Exception("Hulk regression: "+message);}
        static void Next(){stage++;at=Time.time;}
        static void Capture(string name){TankAppearanceValidation.Capture(GameManager.Instance.PlayerEye.GetComponent<Camera>(),name);}
        static void Freeze(EnemySoldier e)
        {
            e.enabled=false;if(e.Combat!=null)e.Combat.enabled=false;
            var nav=e.GetComponent<AssaultNavigation>();if(nav!=null)nav.enabled=false;
            var agent=e.GetComponent<NavMeshAgent>();if(agent!=null)agent.enabled=false;
        }
        static EnemySoldier Target(GameManager gm,int i,Vector3 point,bool friendly=false)
        {
            var e=LevelBuilder.SpawnAssaultSoldier(gm,AssaultLayout.Start,true,1500+i,EnemyRole.MachineGunner,friendly);
            gm.Assault.Soldiers.Add(e);Freeze(e);e.transform.position=point;e.transform.rotation=Quaternion.Euler(0,180,0);
            typeof(EnemySoldier).GetProperty("Health").SetValue(e,1000f);
            return e;
        }
        static GameObject Box(string name,Vector3 pos,Vector3 size)
        {var box=GameObject.CreatePrimitive(PrimitiveType.Cube);box.name=name;box.transform.SetParent(fixture.transform);box.transform.position=pos;box.transform.localScale=size;return box;}
        static void Teleport(SniperController p,Vector3 pos)
        {var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.position=pos;p.transform.rotation=Quaternion.identity;c.enabled=true;Physics.SyncTransforms();}
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            if(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)>180){SessionState.SetBool(Key,false);EditorApplication.Exit(2);return;}
            try
            {
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm!=null&&gm.IsPlaying&&gm.Assault!=null)
                {
                    if(lastFrame==Time.frameCount)return;lastFrame=Time.frameCount;
                    var p=gm.Player;
                    float age=Time.time-at;
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        h=p.Hulk;Check(h!=null,"missing city transformation");ammo=p.AmmoInMag;cityPosition=p.transform.position;
                        foreach(var e in gm.Assault.Soldiers)Freeze(e);gm.Assault.enabled=false;gm.Health.Max=10000;gm.Health.Configure(0,10000);
                        var button=h.GetComponentsInChildren<Button>().First(b=>b.name=="Transform");button.onClick.Invoke();
                        Check(h.Active,"transformation button did not activate");
                        Check(h.Transforming && h.Audio.Ready,"transformation / audio assets missing");
                        Check(h.Visual.UsesReferenceAsset,"supplied skinned model was not loaded");
                        Check(h.Visual.GetComponentsInChildren<SkinnedMeshRenderer>()[0].bones.Length==43,"reference skeleton mismatch");
                        initialScale=h.Visual.transform.localScale.x;Next();
                    }
                    else if(stage==1&&age<1.7f)
                    {
                        Check(!h.BeginAttack(HulkController.Attack.Punch)&&!h.Toggle(),"transformation can be interrupted by attack/toggle");
                        Vector3 before=p.transform.position;h.Move(Vector2.up,Time.deltaTime);
                        Check(Vector2.Distance(new Vector2(before.x,before.z),new Vector2(p.transform.position.x,p.transform.position.z))<.001f,"moving during transformation");
                        if(age>.5f&&!transformCaptured){Capture("hulk_reference_transform");transformCaptured=true;initialScale=h.Visual.transform.localScale.x;}
                    }
                    else if(stage==1&&age>1.95f)
                    {
                        var skins=h.Visual.GetComponentsInChildren<SkinnedMeshRenderer>();
                        Check(skins[0].sharedMesh.triangles.Length/3==139559&&skins[1].sharedMesh.triangles.Length/3==49703,"reference mesh triangles changed");
                        restingArm=skins[0].bones.First(b=>b.name=="RightUpperArm").localRotation;
                        Check(!h.Transforming && h.Visual.transform.localScale.x>initialScale+.1f,"transformation did not grow/finish");
                        Check(h.Audio.Count(HulkAudio.Cue.Transform)==1,"transform sound duplicate/missing");
                        Check(Vector3.Dot(p.Eye.position-p.transform.position,p.transform.forward)<-2,"camera not behind body");
                        Check(Vector3.Distance(p.AimPoint,p.transform.position)<3,"AI target follows chase camera");
                        p.GetDamageCapsule(out var bottom,out var top);Check(Mathf.Abs(top.y-p.transform.position.y-2.85f)<.1f,"damage capsule not Hulk-sized");
                        Check(!p.CanSwitchWeapon&&!p.Grenades.enabled,"weapons still enabled");
                        float hp=gm.Health.Current;gm.Health.TakeDamage(10);Check(Mathf.Abs(hp-gm.Health.Current-3.5f)<.01f,"damage resistance wrong");Capture("hulk_city_rear");
                        fixture=new GameObject("Hulk validation arena");Box("Ground",origin+Vector3.down*.55f,new Vector3(100,1,100));Teleport(p,origin);
                        front=Target(gm,1,origin+new Vector3(0,0,2.9f));far=Target(gm,2,origin+new Vector3(0,0,11));
                        protectedEnemy=Target(gm,3,origin+new Vector3(0,0,-3));ally=Target(gm,4,origin+new Vector3(-1.5f,0,2.8f),true);allyHealth=ally.Health;
                        Physics.SyncTransforms();Next();
                    }
                    else if(stage==2&&age>.3f){Check(h.BeginAttack(HulkController.Attack.Punch),"punch rejected");Next();}
                    else if(stage==3&&age>.34f&&age<.7f&&!punchCaptured)
                    {
                        Check(h.Visual.Motion=="Punch","pack punch animation not playing");
                        var arm=h.Visual.GetComponentsInChildren<SkinnedMeshRenderer>()[0].bones.First(b=>b.name=="RightUpperArm");
                        Check(Quaternion.Angle(restingArm,arm.localRotation)>35,"reference rig did not deform for punch");Capture("hulk_reference_punch");punchCaptured=true;
                    }
                    else if(stage==3&&age>.85f)
                    {
                        Check(h.Audio.Count(HulkAudio.Cue.PunchSwing)==1&&h.Audio.Count(HulkAudio.Cue.PunchHit)==1,"punch audio events wrong");
                        Check(Mathf.Abs(front.Health-855)<.1f,"punch missed or repeated: "+front.Health);
                        Check(far.Health==1000&&protectedEnemy.Health==1000&&ally.Health==allyHealth,"punch hit distant/back/ally");
                        protectedEnemy.transform.position=origin+new Vector3(5,0,8);
                        Box("Solid blast cover",origin+new Vector3(3.1f,2.2f,5),new Vector3(3,5,1));Physics.SyncTransforms();
                        Check(h.BeginAttack(HulkController.Attack.Clap),"clap rejected");Next();
                    }
                    else if(stage==4&&age>.64f)
                    {
                        Check(h.Audio.Count(HulkAudio.Cue.Clap)==1,"clap audio missing/duplicate");
                        Check(far.Health==1000,"wave hit distant enemy before reaching it");Capture("hulk_clap");Next();
                    }
                    else if(stage==5&&age>1.2f)
                    {
                        Check(Mathf.Abs(front.Health-745)<.1f&&Mathf.Abs(far.Health-890)<.1f,"wave missing / duplicate damage: "+front.Health+" / "+far.Health);
                        Check(protectedEnemy.Health==1000&&ally.Health==allyHealth,"wave crossed cover or damaged ally");
                        Check(!h.BeginAttack(HulkController.Attack.Clap),"clap cooldown bypass");
                        landings=h.Landings;Check(h.BeginAttack(HulkController.Attack.Slam),"jump rejected");Next();
                    }
                    else if(stage==6)
                    {
                        peak=Mathf.Max(peak,p.transform.position.y-origin.y);
                        if(age>.35f&&age<.5f)Capture("hulk_jump");
                        if(h.Landings>landings){Capture("hulk_slam");Next();}
                        else Check(age<3,"jump did not land");
                    }
                    else if(stage==7&&age>1.3f)
                    {
                        Check(h.Audio.Count(HulkAudio.Cue.Jump)==1&&h.Audio.Count(HulkAudio.Cue.Slam)==1,"jump/landing sound not distinct single events");
                        Check(peak>2,"jump too low");Check(h.Landings==landings+1,"slam repeated");
                        Check(Mathf.Abs(front.Health-545)<.1f,"slam damage wrong: "+front.Health);
                        Check(far.Health==890&&ally.Health==allyHealth,"slam range / friendly fire");
                        Check(!h.BeginAttack(HulkController.Attack.Slam),"slam cooldown bypass");
                        beforeMove=p.transform.position;Next();
                    }
                    else if(stage==8)
                    {
                        h.Move(Vector2.left,Time.deltaTime);
                        if(age>.7f){Check(Vector3.Distance(p.transform.position,beforeMove)>2.5f,"movement failed");Check(p.AmmoInMag==ammo,"Hulk used bullets");
                            Check(h.BeginAttack(HulkController.Attack.Punch),"miss punch rejected");stage=80;at=Time.time;}
                    }
                    else if(stage==80&&age>.85f)
                    {
                        Check(h.Audio.Count(HulkAudio.Cue.PunchSwing)==2&&h.Audio.Count(HulkAudio.Cue.PunchHit)==1,"miss punch incorrectly played body impact");
                        Check(h.Toggle(),"human restore rejected");stage=9;at=Time.time;
                    }
                    else if(stage==9&&age>.2f)
                    {
                        Check(!p.IsHulk&&p.Grenades.enabled&&p.CanSwitchWeapon,"FPS controls not restored");
                        Check(Vector3.Distance(p.Eye.localPosition,Vector3.up*1.68f)<.05f,"FPS eye not restored");
                        Check(Mathf.Abs(p.GetComponent<CharacterController>().height-FpsMovement.StandingHeight)<.01f,"human capsule not restored");
                        ceiling=Box("Low ceiling",p.transform.position+Vector3.up*2.6f,new Vector3(5,.3f,5));Physics.SyncTransforms();
                        Check(!h.Toggle()&&!h.Active,"transformed through low ceiling");ceiling.SetActive(false);UnityEngine.Object.Destroy(ceiling);
                        Check(h.Toggle(),"second transformation failed");Next();
                    }
                    else if(stage==10&&age>1.95f)
                    {
                        Box("Camera wall",p.transform.position+new Vector3(0,2,-2.8f),new Vector3(8,5,.4f));Physics.SyncTransforms();Next();
                    }
                    else if(stage==11&&age>.2f)
                    {
                        Check(p.Eye.position.z>p.transform.position.z-2.6f,"camera passed through wall");
                        Check(h.Toggle(),"final restore failed");fixture.SetActive(false);UnityEngine.Object.Destroy(fixture);Teleport(p,cityPosition);
                        foreach(var target in new[]{front,far,protectedEnemy,ally}){gm.Assault.Soldiers.Remove(target);UnityEngine.Object.Destroy(target.gameObject);}
                        foreach(var e in gm.Assault.Soldiers)
                        {
                            e.enabled=true;if(e.Combat!=null)e.Combat.enabled=true;
                            var agent=e.GetComponent<NavMeshAgent>();if(agent!=null)agent.enabled=true;
                            var navigation=e.GetComponent<AssaultNavigation>();if(navigation!=null)navigation.enabled=true;
                        }
                        gm.Assault.enabled=true;
                        Debug.Log("[Hulk validation] PASS: reference skinned mesh, 43 bones, transformation growth/lockout/audio, attack-specific audio, button, rear camera, physical movement, punch cone, wave travel/cover/ally protection, cooldowns, jump height="+peak.ToString("0.00")+", one landing, ammo preserved, FPS restore, headroom, camera collision.");
                        Check(h.Toggle(),"city return failed");Next();
                    }
                    else if(stage==12&&age>2f){Capture("hulk_city_final");stage=13;}
                }
                if(!File.Exists("Logs/autoplay_result.txt")||EditorApplication.isPlayingOrWillChangePlaymode)return;
                string result=File.ReadAllText("Logs/autoplay_result.txt");Debug.Log("HULK_RUNTIME_RESULT\n"+result);
                SessionState.SetBool(Key,false);EditorApplication.Exit(stage==13&&result.Contains("errors=0")&&result.Contains("status=완료")?0:3);
            }
            catch(Exception ex){Debug.LogException(ex);SessionState.SetBool(Key,false);EditorApplication.Exit(4);}
        }
    }
}
