using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using OriginalGrenadeAssets;

namespace SniperRidge.EditorTools
{
    public static class GrenadeValidation
    {
        [MenuItem("Sniper Ridge/수류탄 궤적·충돌 검사")]
        public static void Validate()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Play를 중지하고 검사하세요.");
            GrenadePackBuilder.BuildIfMissing();
            var prefab = Resources.Load<GameObject>("Grenades/Prefabs/grenade_olive");
            Check(prefab != null && prefab.transform.Find("EffectOrigin") != null, "수류탄 프리팹/기준점 누락");
            foreach (var renderer in prefab.GetComponentsInChildren<MeshRenderer>())
                foreach (var material in renderer.sharedMaterials)
                    Check(material != null && material.shader.isSupported, "수류탄 재질 누락");
            foreach (var collider in prefab.GetComponentsInChildren<Collider>()) Check(!collider.enabled, "에셋 콜라이더가 켜져 있습니다.");
            Vector3 bounced = GrenadeTrajectory.Bounce(new Vector3(10f, -5f, 0f), Vector3.up);
            Check(bounced.y > 0f && bounced.magnitude < new Vector3(10f, -5f, 0f).magnitude, "바닥 반사 방향/감쇠 오류");
            Check(!GrenadeTrajectory.TryLaunch(Vector3.zero, Vector3.forward * 80f, out _), "사거리 제한 오류");
            Scene previous = SceneManager.GetActiveScene();
            Scene fixture = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            SceneManager.SetActiveScene(fixture);
            try
            {
                Vector3 origin = new Vector3(-20000f, 100f, -20000f);
                var free = new GrenadeTrajectory.State { Position = origin, Velocity = new Vector3(10f, 5f, 0f) };
                for (int i = 0; i < 50; i++) GrenadeTrajectory.Step(ref free);
                Check(Vector3.Distance(free.Position, origin + new Vector3(10f, 5f, 0f) + .5f * GrenadeTrajectory.Gravity) < .06f,
                    "공중 탄도가 1초 자유낙하 해석값과 다릅니다.");
                var floor = new GameObject("GrenadeTestFloor");
                floor.transform.position = origin - Vector3.up * .1f;
                floor.AddComponent<BoxCollider>().size = new Vector3(80f, .2f, 80f);
                Physics.SyncTransforms();
                Vector3 release = origin + Vector3.up * 1.65f;
                Check(GrenadeTrajectory.TryLaunch(release, origin + Vector3.forward * 15f, out Vector3 velocity), "투척 속도 계산 실패");
                var points = new Vector3[GrenadeTrajectory.FuseSteps + 1];
                Vector3 end = GrenadeTrajectory.Predict(release, velocity, points);
                Check(Mathf.Abs(end.y - origin.y - GrenadeTrajectory.Radius) < .025f, "수류탄이 지면 아래로 관통하거나 가라앉지 않았습니다.");
                foreach (int fps in new[] { 30, 60, 144 })
                {
                    var state = new GrenadeTrajectory.State { Position = release, Velocity = velocity };
                    float accumulator = 0f; int steps = 0;
                    while (steps < GrenadeTrajectory.FuseSteps)
                    {
                        accumulator += 1f / fps;
                        while (accumulator >= GrenadeTrajectory.StepSeconds && steps < GrenadeTrajectory.FuseSteps)
                        { GrenadeTrajectory.Step(ref state); accumulator -= GrenadeTrajectory.StepSeconds; steps++; }
                    }
                    Check(Vector3.Distance(end, state.Position) < .001f, "프레임률에 따라 실제 궤적이 미리보기와 달라집니다: " + fps);
                }
                var wall = new GameObject("GrenadeTestWall");
                wall.transform.position = origin + new Vector3(0f, 10f, 5f);
                wall.AddComponent<BoxCollider>().size = new Vector3(12f, 20f, .4f);
                Physics.SyncTransforms();
                GrenadeTrajectory.Predict(release, velocity, points);
                foreach (var point in points) Check(point.z < origin.z + 4.82f, "수류탄이 벽을 통과했습니다.");
                wall.layer = EnemyRagdoll.CorpseLayer;
                Physics.SyncTransforms();
                Check(Vector3.Distance(end, GrenadeTrajectory.Predict(release, velocity, points)) < .001f, "시체 레이어가 궤적을 막습니다.");
                wall.layer = 0; wall.transform.position = release + Vector3.forward * .2f;
                wall.GetComponent<BoxCollider>().size = new Vector3(1f, 1f, .08f);
                Physics.SyncTransforms();
                Check(!GrenadeTrajectory.ClearRelease(release, release + Vector3.forward * .5f), "눈과 손 사이의 벽을 관통해 투척할 수 있습니다.");
            }
            finally
            {
                SceneManager.SetActiveScene(previous);
                EditorSceneManager.CloseScene(fixture, true);
                Physics.SyncTransforms();
            }
            Debug.Log("[Sniper Ridge] 수류탄 검사 통과: 프리팹, 탄도, 바닥/벽 충돌, 30/60/144 FPS의 예측 일치, 시체 제외, 손 앞 장애물. Play에서 W 조준·놓기·취소와 수량을 확인하세요.");
        }
        static void Check(bool condition, string message)
        { if (!condition) throw new InvalidOperationException("[수류탄 검사] " + message); }
    }
}
