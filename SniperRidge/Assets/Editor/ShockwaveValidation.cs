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
    [InitializeOnLoad]
    public static class ShockwaveValidation
    {
        const string Key="Shockwave.Validation";
        static int stage,last=-1,frame,landings;
        static float at,nextFrame,kneeMotion;
        static Vector3 arena=new Vector3(1500,40.05f,1500),city;
        static Vector2 move;
        static Quaternion kneeStart;
        static HulkController h;
        static HulkWave slam;
        static EnemySoldier exposed,covered,rear;
        static ShockwaveValidation(){EditorApplication.update+=Poll;}
        static void Check(bool ok,string why){if(!ok)throw new Exception("Shockwave: "+why);}
        static void Next(){stage++;at=Time.time;}
        public static void Run()
        {
            NativeClapImport.Run();NativeMutantValidation.Run();PreviewClap();
            EditorSceneManager.OpenScene("Assets/Scenes/SniperRidge.unity");Directory.CreateDirectory("Logs");
            File.Delete("Logs/autoplay_result.txt");File.Delete("Logs/shockwave-play.txt");
            File.WriteAllText("Logs/autoplay.txt","mode=9\nwait=65\ntag=shockwave\nquit=1\n");
            SessionState.SetBool(Key,true);SessionState.SetFloat(Key+"start",(float)EditorApplication.timeSinceStartup);
        }
        static void Capture(Camera camera,string name)
        {
            var rt=new RenderTexture(960,600,24);var image=new Texture2D(960,600,TextureFormat.RGB24,false);var previous=camera.targetTexture;var old=RenderTexture.active;
            try{camera.targetTexture=rt;camera.Render();RenderTexture.active=rt;image.ReadPixels(new Rect(0,0,960,600),0,0);image.Apply();Directory.CreateDirectory("Screenshots/shockwave");File.WriteAllBytes("Screenshots/shockwave/"+name+".png",image.EncodeToPNG());}
            finally{camera.targetTexture=previous;RenderTexture.active=old;UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);}
        }
        public static void PreviewClap()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Flat;RenderSettings.ambientLight=new Color(.65f,.65f,.65f);var light=new GameObject("Light").AddComponent<Light>();light.type=LightType.Directional;light.intensity=1.2f;light.transform.rotation=Quaternion.Euler(45,30,0);
            var floor=GameObject.CreatePrimitive(PrimitiveType.Plane);floor.GetComponent<Renderer>().sharedMaterial=new Material(Shader.Find("Standard")){color=new Color(.23f,.25f,.27f)};
            var camera=new GameObject("Preview").AddComponent<Camera>();camera.transform.position=new Vector3(3,2.1f,4.7f);camera.transform.LookAt(Vector3.up*1.5f);camera.fieldOfView=40;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.15f,.18f,.21f);
            var actor=new GameObject("Preview actor");var visual=HulkVisual.Create(actor.transform);Check(visual.Definition.Clap,"native clap missing");
            var left=visual.MotionBones.First(b=>b.name=="mixamorig:LeftHand");var right=visual.MotionBones.First(b=>b.name=="mixamorig:RightHand");float open=0,closed=0;
            foreach(float time in new[]{0,.23f,HulkController.ClapImpactTime,.7f,1f})
            {
                visual.Pose(0,HulkController.Attack.Clap,time,true,false,-1,.2f);
                var skins=visual.GetComponentsInChildren<SkinnedMeshRenderer>();
                foreach(var skin in skins)
                {
                    var baked=new Mesh();skin.BakeMesh(baked);
                    var snapshot=new GameObject("Pose snapshot");snapshot.transform.SetParent(skin.transform,false);snapshot.transform.localScale=Vector3.one/visual.Definition.Scale;
                    snapshot.AddComponent<MeshFilter>().sharedMesh=baked;snapshot.AddComponent<MeshRenderer>().sharedMaterials=skin.sharedMaterials;skin.enabled=false;
                }
                Capture(camera,"clap_"+time.ToString("F2"));
                foreach(var skin in skins)
                {
                    var snapshot=skin.transform.Find("Pose snapshot");UnityEngine.Object.DestroyImmediate(snapshot.GetComponent<MeshFilter>().sharedMesh);UnityEngine.Object.DestroyImmediate(snapshot.gameObject);skin.enabled=true;
                }
                if(time==.23f)open=Vector3.Distance(left.position,right.position);
                if(time==HulkController.ClapImpactTime)closed=Vector3.Distance(left.position,right.position);
            }
            Check(open>1.5f&&closed<.32f,"clap hands never meet: "+open+" -> "+closed);
            Directory.CreateDirectory("Logs");File.WriteAllText("Logs/shockwave-pose.txt",$"PASS: power clap palm spacing {open:F3} -> {closed:F3}m at {HulkController.ClapImpactTime:F2}s\n");
        }
        static void Freeze(EnemySoldier e){e.enabled=false;if(e.Combat)e.Combat.enabled=false;var n=e.GetComponent<AssaultNavigation>();if(n)n.enabled=false;var a=e.GetComponent<NavMeshAgent>();if(a)a.enabled=false;}
        static EnemySoldier Spawn(GameManager gm,Vector3 position)
        {var e=LevelBuilder.SpawnAssaultSoldier(gm,AssaultLayout.Start,true,1808,EnemyRole.MachineGunner,false);gm.Assault.Soldiers.Add(e);Freeze(e);e.transform.position=position;typeof(EnemySoldier).GetProperty("Health").SetValue(e,1000f);return e;}
        static void Teleport(SniperController p,Vector3 position){var c=p.GetComponent<CharacterController>();c.enabled=false;p.transform.SetPositionAndRotation(position,Quaternion.identity);c.enabled=true;Physics.SyncTransforms();}
        static void Poll()
        {
            if(!SessionState.GetBool(Key,false))return;
            if(EditorApplication.timeSinceStartup-SessionState.GetFloat(Key+"start",0)>240){Debug.LogError("Shockwave timeout "+stage);SessionState.SetBool(Key,false);EditorApplication.Exit(2);return;}
            try
            {
                var gm=GameManager.Instance;
                if(EditorApplication.isPlaying&&gm&&gm.IsPlaying&&gm.Assault!=null)
                {
                    if(last==Time.frameCount)return;last=Time.frameCount;float age=Time.time-at;var p=gm.Player;
                    if(h&&h.Active){h.Move(move,Time.deltaTime);h.Tick(0);}
                    if(stage>=7&&stage<=11&&Time.time>nextFrame){Capture(gm.PlayerEye.GetComponent<Camera>(),"city_"+(frame++).ToString("D3"));nextFrame=Time.time+.065f;}
                    if(stage==0&&p.State==SniperController.WeaponState.Ready)
                    {
                        p.enabled=false;city=p.transform.position;gm.Assault.StopAllCoroutines();foreach(var e in gm.Assault.Soldiers)Freeze(e);gm.Assault.enabled=false;gm.Health.Max=10000;gm.Health.Configure(0,10000);
                        h=p.Hulk;Check(h.Toggle(),"transform rejected");Next();
                    }
                    else if(stage==1&&age>HulkController.TransformDuration+.2f)
                    {
                        var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.transform.position=arena+Vector3.down*.55f;floor.transform.localScale=new Vector3(100,1,100);
                        Teleport(p,arena);exposed=Spawn(gm,arena+new Vector3(-5,0,6));covered=Spawn(gm,arena+new Vector3(0,0,8));rear=Spawn(gm,arena+new Vector3(0,0,-4));
                        var wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=arena+new Vector3(0,2,5);wall.transform.localScale=new Vector3(2.5f,4,.5f);Physics.SyncTransforms();
                        // Identical wavefront/dust counts at common frame rates, with wall occlusion.
                        int count=-1;
                        foreach(int fps in new[]{30,60,120})
                        {
                            var wave=HulkWave.Create(arena+Vector3.up*2.05f,Vector3.forward,18,true);wave.enabled=false;
                            Check(wave.LimitAt(36)<4.8f,"pressure goes through cover");Check(wave.GetComponentInChildren<AudioSource>().transform.position==arena+Vector3.up*2.05f,"rumble not at impact");
                            for(int i=0;i<fps;i++)wave.Advance(1f/fps);
                            Check(Mathf.Abs(wave.CurrentRadius-18)<.001f&&wave.DustEmitted>0&&wave.DebrisEmitted>0,"front/particles missing");
                            if(count>=0)Check(count==wave.DustEmitted,"frame-dependent dust emission");count=wave.DustEmitted;
                            Check(wave.GetComponentsInChildren<ParticleSystem>().Sum(ps=>ps.main.maxParticles)<=wave.ParticleLimit,"unbounded particle count");UnityEngine.Object.Destroy(wave.gameObject);
                        }
                        Next();
                    }
                    else if(stage==2&&age>.3f)
                    {
                        var button=h.GetComponentsInChildren<Button>().First(b=>b.name=="Clap");Check(button.gameObject.activeInHierarchy,"clap button hidden");
                        var visible=h.GetComponentsInChildren<Button>().Where(b=>b.gameObject.activeInHierarchy).ToArray();
                        for(int i=0;i<visible.Length;i++)for(int j=i+1;j<visible.Length;j++)
                            Check(Mathf.Abs(((RectTransform)visible[i].transform).anchoredPosition.y-((RectTransform)visible[j].transform).anchoredPosition.y)>=50,"skill buttons overlap");
                        button.onClick.Invoke();Check(h.CurrentAttack==HulkController.Attack.Clap,"clap UI rejected");Next();
                    }
                    else if(stage==3)
                    {
                        if(age<HulkController.ClapImpactTime-.05f)Check(exposed.Health==1000&&h.Audio.Count(HulkAudio.Cue.Clap)==0,"damage/sound precede contact");
                        if(age<HulkController.ClapDuration-.03f)Check(h.Visual.ActiveBlenderClip==h.Visual.Definition.Clap,"wrong clap clip");
                        if(age<1.7f)return;
                        Check(Mathf.Abs(exposed.Health-890)<.1f&&covered.Health==1000&&rear.Health==1000,"cone, cover, or single-hit damage wrong");Check(h.Audio.Count(HulkAudio.Cue.Clap)==1,"clap sound duplicated/missing");Check(!h.BeginAttack(HulkController.Attack.Clap),"clap cooldown bypass");
                        landings=h.Landings;Check(h.BeginAttack(HulkController.Attack.Slam),"slam rejected");Next();
                    }
                    else if(stage==4)
                    {
                        if(h.Landings>landings&&!slam)slam=UnityEngine.Object.FindObjectsOfType<HulkWave>().FirstOrDefault(w=>!w.Directional);
                        if(age<1.4f)return;Check(h.Landings==landings+1&&slam&&slam.DustEmitted>0,"landing shockwave missing/duplicate");
                        Teleport(p,arena+Vector3.right*20);Next();
                    }
                    else if(stage==5&&age>1.2f)
                    {Check(h.BeginAttack(HulkController.Attack.Clap),"second clap failed");move=Vector2.left;kneeStart=h.Visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg").localRotation;Next();}
                    else if(stage==6)
                    {
                        kneeMotion=Mathf.Max(kneeMotion,Quaternion.Angle(kneeStart,h.Visual.MotionBones.First(b=>b.name=="mixamorig:LeftLeg").localRotation));
                        if(age<1.3f)return;Check(kneeMotion>25,"moving clap freezes legs");move=Vector2.zero;Teleport(p,city);Next();
                    }
                    else if(stage==7&&age>3){Check(h.BeginAttack(HulkController.Attack.Clap),"city clap failed");Next();}
                    else if(stage==8&&age>4f){Check(UnityEngine.Object.FindObjectsOfType<HulkWave>().Length==0,"expired waves leak");Check(h.BeginAttack(HulkController.Attack.Slam),"city slam failed");Next();}
                    else if(stage==9&&age>4.5f)
                    {
                        var shader=Resources.Load<Shader>("Shaders/HulkPressure");Check(shader&&shader.isSupported&&!ShaderUtil.ShaderHasError(shader),"pressure shader failed on Metal");Check(UnityEngine.Object.FindObjectsOfType<HulkWave>().Length==0,"slam particles leak");
                        File.WriteAllText("Logs/shockwave-play.txt","PASS: clap UI and original skeleton clip; .43s strike/audio; front-facing cone, cover and single damage; cooldown; real jump landing wave; moving clap legs; pressure shader on Metal; 30/60/120fps propagation and particle counts; 480-particle bound; sounds at source; cleanup; city gameplay render.\nKnee travel="+kneeMotion+"deg\n");Debug.Log("[Shockwave] PASS");p.enabled=true;stage=99;
                    }
                }
                if(!File.Exists("Logs/autoplay_result.txt")||EditorApplication.isPlayingOrWillChangePlaymode)return;
                string result=File.ReadAllText("Logs/autoplay_result.txt");SessionState.SetBool(Key,false);EditorApplication.Exit(stage==99&&result.Contains("errors=0")?0:3);
            }
            catch(Exception ex){Debug.LogException(ex);SessionState.SetBool(Key,false);EditorApplication.Exit(4);}
        }
    }
}
