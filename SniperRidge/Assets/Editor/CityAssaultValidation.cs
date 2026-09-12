using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    public static class CityAssaultValidation
    {
        [MenuItem("Sniper Ridge/도시 FPS 진행·이동 검사")]
        public static void Validate()
        {
            ValidateProgress();
            if(EditorApplication.isPlaying)
            {
                Check(GameManager.Instance!=null && GameManager.Instance.Mission==MissionType.Assault,
                    "도시 FPS 작전에 진입한 뒤 실행하세요.");
                AssaultWorld.ValidateNavigation();
                Check(GameManager.Instance.Player.GetComponent<CharacterController>()!=null,"플레이어 이동 충돌체 누락");
                Debug.Log("[Sniper Ridge] FPS 600초 진행 조건과 실제 도시 목표/증원 경로 검사 통과");
            }
            else
            {
                ValidateMovement();
                Debug.Log("[Sniper Ridge] FPS 600초 진행 조건·벽 충돌·후진·보도 턱·앉아서 통과 검사 통과. 도시 FPS Play 중 같은 메뉴로 실제 도보/증원 경로를 검사하세요.");
            }
        }
        static void ValidateProgress()
        {
            var progress=new AssaultProgress();
            progress.Tick(600,false);
            Check(progress.Secured==0 && !progress.TryAdvance(0),"구역 밖에서 목표 진행");
            progress.Tick(-10,true);Check(progress.Secured==0,"음수 시간 누적");
            float elapsed=0;
            for(int sector=0;sector<6;sector++)
            {
                for(int second=0;second<100;second++)
                {
                    if(second%20==0){Check(progress.WaveDue,"증원 시점 누락");progress.SentWave();}
                    Check(!progress.TryAdvance(0),"100초 전 조기 완료");
                    progress.Tick(1,true);elapsed++;
                }
                Check(progress.WavesSent==5 && !progress.WaveDue,"증원 수 오류");
                Check(!progress.TryAdvance(1),"살아 있는 적을 남긴 채 완료");
                Check(progress.TryAdvance(0) && progress.Sector==sector+1,"전투 완료 후 진행 실패");
            }
            Check(progress.Complete && elapsed==600,"전체 확보 시간/완료 조건 오류");
            Check(!progress.TryAdvance(0),"완료 후 추가 진행");
            var delayed=new AssaultProgress();delayed.Tick(100,true);
            Check(!delayed.TryAdvance(0),"증원 없이 거점 완료");
            for(int i=0;i<5;i++)delayed.SentWave();
            Check(delayed.TryAdvance(0),"지연된 증원 격퇴 후 완료 실패");
        }
        static void ValidateMovement()
        {
            var scene=SceneManager.CreateScene("FPS movement check "+Guid.NewGuid(),new CreateSceneParameters(LocalPhysicsMode.Physics3D));
            try
            {
                var physics=scene.GetPhysicsScene();
                Box(scene,"Ground",new Vector3(0,-.5f,0),new Vector3(40,1,40));
                var player=new GameObject("FPS controller");SceneManager.MoveGameObjectToScene(player,scene);
                player.layer=2;player.transform.position=Vector3.up*.1f;
                var controller=player.AddComponent<CharacterController>();FpsMovement.Configure(controller);
                Step(controller,physics,Vector3.zero,20);
                Step(controller,physics,Vector3.forward*4.6f,50);
                Check(player.transform.position.z>4f,"접지 전진 실패");
                Step(controller,physics,Vector3.back*4.6f,50);
                Check(Mathf.Abs(player.transform.position.z)<.3f,"후진 실패");
                var wall=Box(scene,"Wall",new Vector3(0,2,3),new Vector3(10,4,.3f));
                Step(controller,physics,Vector3.forward*4.6f,80);
                Check(player.transform.position.z<2.65f,"벽 관통");
                float blocked=player.transform.position.z;
                Step(controller,physics,Vector3.back*4.6f,30);
                Check(player.transform.position.z<blocked-2f,"벽에서 후퇴 실패");
                wall.SetActive(false);
                Reset(controller);var curb=Box(scene,"Curb",new Vector3(0,.09f,3),new Vector3(10,.18f,2));
                Step(controller,physics,Vector3.forward*4.6f,70);
                Check(player.transform.position.z>5f,"보도 턱 통과 실패");curb.SetActive(false);
                var lintel=Box(scene,"Low passage",new Vector3(0,2.13f,3),new Vector3(10,1.7f,1));
                Reset(controller);Step(controller,physics,Vector3.forward*4.6f,70);
                Check(player.transform.position.z<2.3f,"선 자세로 낮은 통로 관통");
                controller.height=FpsMovement.CrouchHeight;controller.center=Vector3.up*FpsMovement.CrouchHeight*.5f;
                Step(controller,physics,Vector3.forward*2.1f,100);
                Check(player.transform.position.z>5f,"앉은 자세로 통로 통과 실패");
            }
            finally{EditorSceneManager.CloseScene(scene,true);}
        }
        static void Reset(CharacterController controller)
        {controller.enabled=false;controller.transform.position=Vector3.up*.1f;controller.enabled=true;Physics.SyncTransforms();}
        static void Step(CharacterController controller,PhysicsScene physics,Vector3 velocity,int count)
        {
            for(int i=0;i<count;i++){Physics.SyncTransforms();controller.Move((velocity+Vector3.down*2f)*.02f);physics.Simulate(.02f);}
        }
        static GameObject Box(Scene scene,string name,Vector3 position,Vector3 size)
        {
            var go=new GameObject(name,typeof(BoxCollider));SceneManager.MoveGameObjectToScene(go,scene);
            go.transform.position=position;go.GetComponent<BoxCollider>().size=size;return go;
        }
        static void Check(bool ok,string message)
        {if(!ok)throw new InvalidOperationException("[도시 FPS 검사] "+message);}
    }
}
