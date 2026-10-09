using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
namespace SniperRidge.EditorTools
{
    [InitializeOnLoad]
    public static class CityEscalationValidation
    {
        const string Key="CityEscalation.Validation";static int stage,last=-1;static float at,hp;static GameObject wall;static EnemySoldier flame,sniper;static int shots;static readonly ParticleSystem.Particle[] particles=new ParticleSystem.Particle[450];static bool seenFire,seenShell;
        static CityEscalationValidation(){EditorApplication.update+=Poll;Application.logMessageReceived+=(m,s,t)=>{if(SessionState.GetBool(Key,false)&&(t==LogType.Error||t==LogType.Exception||t==LogType.Assert))SessionState.SetString(Key+"errors",SessionState.GetString(Key+"errors","")+m+"\n");};}
        public static void Run(){EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=500\ntag=city-escalation\nquit=1\n");SessionState.SetBool(Key,true);SessionState.SetString(Key+"errors","");SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);}
        static void Check(bool b,string m){if(!b)throw new Exception("City escalation: "+m);}
        static void Next(){stage++;at=Time.time;Debug.Log("[City escalation] stage "+stage);}
        static void Place(SniperController p,Vector3 pos){var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(pos,Quaternion.identity);c.enabled=true;Physics.SyncTransforms();}
        static void Capture(GameManager gm,string name,Vector3 focus,Vector3 offset)
        {
            var cam=gm.PlayerEye.GetComponent<Camera>();var pos=cam.transform.position;var rot=cam.transform.rotation;cam.transform.position=focus+offset;cam.transform.LookAt(focus);
            var rt=new RenderTexture(1200,750,24);var tex=new Texture2D(1200,750,TextureFormat.RGB24,false);var old=cam.targetTexture;var active=RenderTexture.active;
            try{cam.targetTexture=rt;cam.Render();RenderTexture.active=rt;tex.ReadPixels(new Rect(0,0,1200,750),0,0);tex.Apply();Directory.CreateDirectory("Screenshots/city-escalation");File.WriteAllBytes("Screenshots/city-escalation/"+name+".png",tex.EncodeToPNG());}
            finally{cam.targetTexture=old;RenderTexture.active=active;cam.transform.SetPositionAndRotation(pos,rot);UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(tex);}
        }
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            try
            {
                Check(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)<360,"timeout at "+stage);
                var gm=GameManager.Instance;if(!EditorApplication.isPlaying||!gm||!gm.Assault||last==Time.frameCount)return;last=Time.frameCount;
                var b=gm.Assault;var tank=b.Midboss;var hero=gm.Player.Hulk;float age=Time.time-at;
                if(stage==0&&gm.IsPlaying&&gm.Player.State==SniperController.WeaponState.Ready)
                {
                    b.StopAllCoroutines();b.enabled=false;AssaultWorld.ValidateNavigation();
                    Check(Mathf.Abs(AssaultLayout.BoundaryZ/152f-1.3f)<.03f,"area not expanded about 30%");Check(!b.King&&!b.TankDefeated,"king at startup");
                    var roofs=b.Soldiers.Where(e=>!e.IsAlly&&e.Combat.Post).ToArray();sniper=roofs.FirstOrDefault();Debug.Log("ROOF POSTS "+roofs.Length+" "+string.Join(",",roofs.Select(e=>e.transform.position.ToString())));Check(roofs.Length>=3,"too few real rooftop snipers");
                    foreach(var e in roofs){Check(e.Role==EnemyRole.Sniper&&e.transform.position.y>AssaultLayout.Ground+18,"sniper not elevated");Check(Physics.Raycast(e.transform.position+Vector3.up*.2f,Vector3.down,.7f,EnemyRagdoll.CombatMask),"unsupported roof sniper");}
                    flame=b.Soldiers.FirstOrDefault(e=>e.Role==EnemyRole.Flamethrower);Check(flame,"no flamethrower");
                    foreach(var e in b.Soldiers){e.enabled=false;e.StopAllCoroutines();if(e.Combat)e.Combat.enabled=false;var gren=e.GetComponent<EnemyGrenadier>();if(gren)gren.enabled=false;}
                    gm.Health.Max=10000;gm.Health.Configure(999,0);tank.enabled=false;
                    Place(gm.Player,new Vector3(0,12.05f,145));Check(!b.TrySpawnKing(),"king spawned by bypassing tank");
                    Capture(gm,"expanded-city",new Vector3(0,12,15),new Vector3(90,110,-170));
                    hp=gm.Health.Current;gm.Health.TakeBulletDamage(10);Check(Mathf.Abs(hp-gm.Health.Current-10)<.01f,"human bullet damage");
                    Check(hero.Toggle(),"transform rejected");Next();
                }
                else if(stage==1&&age>3.5f&&!hero.Transforming)
                {
                    hp=gm.Health.Current;gm.Health.TakeBulletDamage(10);Check(Mathf.Abs(hp-gm.Health.Current-7)<.01f,"mutant bullet damage not 70%");
                    Place(gm.Player,new Vector3(Mathf.Round(sniper.transform.position.x/72)*72,12.05f,sniper.transform.position.z));
                    sniper.enabled=true;sniper.Combat.enabled=true;shots=sniper.Combat.ShotsFired;hp=gm.Health.Current;stage=10;at=Time.time;
                }
                else if(stage==10&&age>9)
                {
                    Check(sniper.Combat.ShotsFired>shots,"rooftop sniper did not fire onto street");
                    Capture(gm,"rooftop-sniper",sniper.AimPoint,new Vector3(0,3,-6));sniper.enabled=false;sniper.Combat.enabled=false;
                    Place(gm.Player,new Vector3(0,12.05f,-5));tank.enabled=true;hp=gm.Health.Current;stage=2;at=Time.time;
                }
                else if(stage==2)
                {
                    if(UnityEngine.Object.FindObjectOfType<CityTankShell>())seenShell=true;
                    if(age<9)return;Check(seenShell&&gm.Health.Current<hp,"midboss cannon failed to damage player");tank.enabled=false;
                    Capture(gm,"midboss",tank.AimPoint,new Vector3(2,4,-13));
                    hp=tank.Health;Bullet.Fire(tank.AimPoint-Vector3.forward*12,Vector3.forward,Vector3.zero,200,0,100);Next();
                }
                else if(stage==3&&age>.5f)
                {
                    Check(Mathf.Abs(hp-tank.Health-40)<.1f,"real bullet did not damage tank");
                    hp=tank.Health;ExplosionDamage.Detonate(tank.AimPoint-Vector3.forward*4,200,tank.AimPoint-Vector3.forward*8,null,"검증");Check(tank.Health<hp,"explosion missed tank");
                    var origin=tank.AimPoint-Vector3.forward*5;hp=tank.Health;tank.HeroHit(origin,Vector3.forward,8,90,145,100);tank.HeroHit(origin,Vector3.forward,8,90,145,100);Check(Mathf.Abs(hp-tank.Health-145)<.1f,"wave hit deduplication");tank.HeroHit(origin,Vector3.forward,8,90,20,102);hp=tank.Health;tank.HeroHit(origin,Vector3.forward,8,90,145,100);Check(tank.Health==hp,"old shockwave repeated after a new attack");
                    wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=tank.AimPoint-Vector3.forward*4;wall.transform.localScale=new Vector3(12,8,.3f);Physics.SyncTransforms();hp=tank.Health;
                    tank.HeroHit(tank.AimPoint-Vector3.forward*6,Vector3.forward,8,90,145,101);Check(tank.Health==hp,"melee through cover");Check(!tank.Blast(tank.AimPoint-Vector3.forward*4.4f,200),"blast through cover");UnityEngine.Object.Destroy(wall);
                    Place(gm.Player,new Vector3(0,12.05f,-120));tank.Damage(99999);Check(tank.IsDead&&!b.TrySpawnKing(),"king gate before fortress");Next();
                }
                else if(stage==4&&age>.5f)
                {
                    Capture(gm,"burning-midboss",tank.AimPoint,new Vector3(2,4,-13));
                    // Isolate a real flamethrower on a navigable avenue, keeping its normal AI active.
                    var n=flame.GetComponent<NavMeshAgent>();if(n&&n.enabled)n.Warp(new Vector3(72,12,-115));else flame.transform.position=new Vector3(72,12,-115);
                    flame.Combat.DefensePoint=flame.transform.position;flame.enabled=true;flame.Combat.enabled=true;
                    Place(gm.Player,new Vector3(72,12.05f,-125));hp=gm.Health.Current;shots=flame.Combat.ShotsFired;Next();
                }
                else if(stage==5)
                {
                    var f=flame.GetComponent<EnemyFlamethrower>();var ps=f.GetComponentInChildren<ParticleSystem>();int count=ps.GetParticles(particles);bool extended=count>50&&particles.Take(count).Any(p=>Vector3.Distance(p.position,flame.Muzzle)>7);if(f.Firing&&!seenFire&&extended){seenFire=true;Capture(gm,"flamethrower",flame.transform.position+Vector3.up+Vector3.back*4,new Vector3(-2,3,-8));}
                    if(age<10)return;Check(seenFire&&flame.Combat.ShotsFired>shots&&gm.Health.Current<hp,"flamethrower did not attack");
                    flame.enabled=false;flame.Combat.enabled=false;
                    Vector3 from=new Vector3(0,15,-180),target=from+Vector3.forward*8;
                    Check(EnemyFlamethrower.InFlame(from,Vector3.forward,target,flame.transform),"flame open cone");
                    Check(!EnemyFlamethrower.InFlame(from,Vector3.forward,from+Vector3.right*8,flame.transform),"flame cone angle");Check(!EnemyFlamethrower.InFlame(from,Vector3.forward,from+Vector3.forward*20,flame.transform),"flame range");
                    wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=from+Vector3.forward*4;wall.transform.localScale=new Vector3(5,6,.3f);Physics.SyncTransforms();Check(!EnemyFlamethrower.InFlame(from,Vector3.forward,target,flame.transform),"flame through wall");UnityEngine.Object.Destroy(wall);
                    Place(gm.Player,new Vector3(0,12.05f,140));Check(b.TrySpawnKing()&&b.King,"no king after tank and approach");Check(!b.TrySpawnKing(),"duplicate king");Next();
                }
                else if(stage==6&&age>1)
                {
                    Check(!b.Progress.Complete,"mission won without king");b.King.Soldier.TakeHit(999999,false,Vector3.forward);Check(b.Progress.Complete,"king death did not complete mission");
                    File.WriteAllText("Logs/city-escalation-result.txt","PASS: expanded navigation, 3+ supported rooftop snipers, bullet resistance, boss cannon, bullet/explosion/melee/cover/dedup, gated king, flamethrower attack/cone/cover/range, completion.\n"+SessionState.GetString(Key+"errors",""));Finish();
                }
            }
            catch(Exception e){Debug.LogException(e);File.WriteAllText("Logs/city-escalation-result.txt","FAIL "+e+"\n"+SessionState.GetString(Key+"errors",""));Finish(2);}
        }
        static void Finish(int code=0){if(SessionState.GetString(Key+"errors","")!="")code=2;SessionState.SetBool(Key,false);File.Delete("Logs/autoplay.txt");EditorApplication.Exit(code);}
    }
}
