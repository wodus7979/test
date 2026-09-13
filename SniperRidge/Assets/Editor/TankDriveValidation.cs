using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SniperRidge.EditorTools
{
    /// <summary>Exercise the production motor and asset colliders in an isolated physics scene.</summary>
    public static class TankDriveValidation
    {
        const float StepSeconds = .02f;

        [MenuItem("Sniper Ridge/전차 주행·제동·충돌 검사")]
        public static void Validate()
        {
            Check(!EditorApplication.isPlayingOrWillChangePlaymode, "Play를 멈춘 뒤 검사하세요.");
            OriginalTankAssets.TankPackBuilder.BuildIfMissing();
            var prefab = Resources.Load<GameObject>(TankVehicle.Resource);
            Check(prefab != null, "전차 프리팹 누락");
            Scene previousScene=SceneManager.GetActiveScene();
            bool batch=Application.isBatchMode;
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,
                batch?NewSceneMode.Single:NewSceneMode.Additive);
            SceneManager.SetActiveScene(scene);
            SimulationMode previousSimulationMode=Physics.simulationMode;
            Physics.simulationMode=SimulationMode.Script;
            TerrainData groundData = null;
            PhysicMaterial contact = null;
            try
            {
                var physics = Physics.defaultPhysicsScene;
                groundData = new TerrainData { heightmapResolution = 33, size = new Vector3(500f, 10f, 500f) };
                var ground = new GameObject("Test terrain", typeof(TerrainCollider));
                SceneManager.MoveGameObjectToScene(ground, scene);
                ground.transform.position = new Vector3(-250f, 0f, -250f);
                ground.GetComponent<TerrainCollider>().terrainData = groundData;
                var tank = UnityEngine.Object.Instantiate(prefab);
                SceneManager.MoveGameObjectToScene(tank, scene);
                var body = tank.AddComponent<Rigidbody>();
                contact = TankDrive.Configure(body);
                Reset(body, physics);
                Advance(body, physics, 1f, 0f, 100);
                float forward = body.position.z;
                Check(forward > 4f && body.velocity.z > 5f, "접지 상태에서 전진 출발 실패: " + forward);
                Advance(body, physics, 1f, 0f, 100);
                Check(Mathf.Abs(body.velocity.z - TankVehicle.ForwardSpeed) < .2f, "전진 최고 속도 오류");
                float brakeStart = body.position.z;
                Advance(body, physics, 0f, 0f, 75);
                Check(Mathf.Abs(body.velocity.z) < .1f && body.position.z - brakeStart < 8f,
                    "키를 놓은 뒤 제동 실패");

                Reset(body, physics);
                Advance(body, physics, -1f, 0f, 100);
                Check(body.position.z < -4f && body.velocity.z < -5f, "접지 상태에서 후진 출발 실패");
                Reset(body, physics);
                Advance(body, physics, 0f, 1f, 50);
                Check(Vector3.SignedAngle(Vector3.forward, body.rotation * Vector3.forward, Vector3.up) > 30f, "D 우회전 실패");
                Reset(body, physics);
                Advance(body, physics, 0f, -1f, 50);
                Check(Vector3.SignedAngle(Vector3.forward, body.rotation * Vector3.forward, Vector3.up) < -30f, "A 좌회전 실패");

                var wall = new GameObject("Solid wall", typeof(BoxCollider));
                SceneManager.MoveGameObjectToScene(wall, scene);
                wall.transform.position = new Vector3(0f, 3f, 12f);
                wall.GetComponent<BoxCollider>().size = new Vector3(16f, 6f, 1f);
                Reset(body, physics);
                Advance(body, physics, 1f, 0f, 200);
                Check(body.position.z > 5f && body.position.z < 9f, "장애물 충돌에서 정지하지 못했습니다.");
                float blockedAt = body.position.z;
                Advance(body, physics, -1f, 0f, 100);
                Check(body.position.z < blockedAt - 3f, "장애물에서 후진으로 빠져나오지 못했습니다.");
                wall.SetActive(false);
                Reset(body, physics, TankBattle.Bounds - 1f);
                Advance(body, physics, 1f, 0f, 100);
                Check(body.position.z <= TankBattle.Bounds + .05f, "전장 경계 통과");
                // Exercise the same slope motor against an actual TerrainCollider.
                ground.transform.position=new Vector3(-300,0,-300);
                groundData.heightmapResolution=513;groundData.size=new Vector3(600,200,600);
                var hills=new float[513,513];
                for(int z=0;z<513;z++)for(int x=0;x<513;x++)hills[z,x]=TankCanyon.Height(x/512f*600-300,z/512f*600-300)/200f;
                groundData.SetHeights(0,0,hills);
                var terrain=ground.AddComponent<Terrain>();terrain.terrainData=groundData;
                body.constraints=RigidbodyConstraints.None;
                Check(TankCanyon.Linked(TankCanyon.EntryNode,TankCanyon.EntryExitNode),"출발 방향의 협곡 진입로가 막혀 있습니다.");
                body.position=TankCanyon.Ground(terrain,TankCanyon.Node(TankCanyon.EntryNode),.2f);
                Vector3 normal=TankCanyon.Normal(terrain,body.position);
                body.rotation=Quaternion.LookRotation(Vector3.ProjectOnPlane(TankCanyon.EntryDirection,normal).normalized,normal);
                body.velocity=Vector3.up*4f;
                Check(Mathf.Abs(TankDrive.SpeedAlongTracks(body))<.001f,"수직 접지 보정이 주행 속도로 잘못 계산됩니다.");
                body.velocity=body.angularVelocity=Vector3.zero;Physics.SyncTransforms();
                Advance(body,physics,0,0,75,terrain);float initialY=body.position.y;Vector3 entryStart=body.position;
                Advance(body,physics,1,0,200,terrain);
                Check(Vector3.Dot(body.position-entryStart,TankCanyon.EntryDirection)>25f,"실제 시작 위치에서 협곡 진입 실패");
                Check(body.position.y>initialY+.35f,"낮은 언덕을 오르며 고도가 증가하지 않습니다.");
                Check(Vector3.Angle(body.rotation*Vector3.up,Vector3.up)>1f,"차체 경사 정렬 실패");
                Check(Mathf.Abs(body.position.y-TankDrive.SupportHeight(body.position,body.rotation,1f,terrain))<.4f,"경사에서 궤도 접지 실패");
                Advance(body,physics,0,0,100,terrain);
                Check(new Vector2(body.velocity.x,body.velocity.z).magnitude<.2f,"언덕 정차 중 미끄러짐");
                Vector3 reverseStart=body.position;
                Advance(body,physics,-1,0,100,terrain);
                Check(Vector3.Dot(body.position-reverseStart,TankCanyon.EntryDirection)<-4f,"협곡 경사에서 후진 실패");
                // Drive across a former rock island, away from the authored dirt roads.
                body.position=TankCanyon.Ground(terrain,new Vector2(-10,-8),.2f);
                normal=TankCanyon.Normal(terrain,body.position);
                body.rotation=Quaternion.LookRotation(Vector3.ProjectOnPlane(Vector3.right,normal).normalized,normal);
                body.velocity=body.angularVelocity=Vector3.zero;Physics.SyncTransforms();
                Advance(body,physics,0,0,75,terrain);Vector3 offRoadStart=body.position;
                Advance(body,physics,1,0,150,terrain);
                Check(body.position.x-offRoadStart.x>12f,"낮은 언덕의 비포장 구간 주행 실패");
                Check(Mathf.Abs(body.position.y-TankDrive.SupportHeight(body.position,body.rotation,1f,terrain))<.4f,"낮은 언덕의 궤도 접지 실패");
                Debug.Log("[Sniper Ridge] 전차 주행 검사 통과: 전후진·최고 속도·제동·A/D 회전·벽 충돌·경계·협곡 오르막·차체 경사·궤도 접지·언덕 정차. 전진 2초 이동 " + forward.ToString("0.00") + "m");
            }
            finally
            {
                Physics.simulationMode=previousSimulationMode;
                if(!batch)
                {
                    SceneManager.SetActiveScene(previousScene);
                    EditorSceneManager.CloseScene(scene,true);
                }
                if (contact != null) UnityEngine.Object.DestroyImmediate(contact);
                if (groundData != null) UnityEngine.Object.DestroyImmediate(groundData);
            }
        }

        static void Reset(Rigidbody body, PhysicsScene physics, float z = 0f)
        {
            body.position = new Vector3(0f, .1f, z);
            body.rotation = Quaternion.identity;
            body.velocity = body.angularVelocity = Vector3.zero;
            body.WakeUp();
            Physics.SyncTransforms();
            Advance(body, physics, 0f, 0f, 75);
        }
        static void Advance(Rigidbody body, PhysicsScene physics, float drive, float steering, int steps,Terrain terrain=null)
        {
            for (int i = 0; i < steps; i++)
            {
                TankDrive.Step(body, drive, steering, StepSeconds,terrain);
                physics.Simulate(StepSeconds);
            }
        }
        static void Check(bool ok, string message)
        { if (!ok) throw new InvalidOperationException("[전차 주행 검사] " + message); }
    }
}
