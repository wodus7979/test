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
            var scene = SceneManager.CreateScene("Tank drive check " + Guid.NewGuid(),
                new CreateSceneParameters(LocalPhysicsMode.Physics3D));
            TerrainData groundData = null;
            PhysicMaterial contact = null;
            try
            {
                var physics = scene.GetPhysicsScene();
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
                Debug.Log("[Sniper Ridge] 전차 주행 검사 통과: 접지 전진/후진·최고 속도·제동·A/D 회전·벽 충돌·후진 탈출·경계. 전진 2초 이동 " + forward.ToString("0.00") + "m");
            }
            finally
            {
                EditorSceneManager.CloseScene(scene, true);
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
        static void Advance(Rigidbody body, PhysicsScene physics, float drive, float steering, int steps)
        {
            for (int i = 0; i < steps; i++)
            {
                TankDrive.Step(body, drive, steering, StepSeconds);
                physics.Simulate(StepSeconds);
            }
        }
        static void Check(bool ok, string message)
        { if (!ok) throw new InvalidOperationException("[전차 주행 검사] " + message); }
    }
}
