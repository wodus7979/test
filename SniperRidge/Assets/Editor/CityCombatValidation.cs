using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class CityCombatValidation
    {
        [MenuItem("Sniper Ridge/도시 맵·옥상 배치 검사")]
        public static void Validate()
        {
            if (!EditorApplication.isPlaying) CityPackSetup.BuildIfMissing();
            Check(CityBattlefield.IsReady, "도시 에셋이 누락됐습니다.");
            var spawns = CityLayout.SniperSpawns();
            Check(spawns.Count == 10, "저격 임무 인원 오류");
            int roofs = 0, snipers = 0;
            var colors = new HashSet<int>();
            for (int i = 0; i < spawns.Count; i++)
            {
                var spawn = spawns[i];
                if (spawn.Role == EnemyRole.Sniper) snipers++; else colors.Add(spawn.UniformVariant);
                if (float.IsNaN(spawn.SurfaceY)) continue;
                roofs++;
                var building = CityLayout.Data.buildings[CityLayout.Data.posts[i].building];
                var prefab = Resources.Load<GameObject>("CityPack/Prefabs/" + building.asset);
                Vector3 local = Quaternion.Inverse(Quaternion.Euler(0f, building.yaw, 0f))
                    * (CityLayout.Ground(spawn) - building.Position);
                bool supported = false;
                foreach (var collider in prefab.GetComponentsInChildren<BoxCollider>())
                {
                    Vector3 center = collider.transform.TransformPoint(collider.center);
                    Vector3 half = Vector3.Scale(collider.size, collider.transform.lossyScale) * .5f;
                    if (Mathf.Abs(local.x - center.x) < half.x - .45f && Mathf.Abs(local.z - center.z) < half.z - .45f
                        && Mathf.Abs(local.y - center.y - half.y) < .05f) supported = true;
                }
                Check(supported, "옥상 발판 충돌체 또는 높이 오류: " + i);
            }
            Check(roofs == 6 && snipers == 4 && colors.SetEquals(new[] { 0, 1, 2 }), "옥상 인원·병과·군복 배치 오류");
            var random = new System.Random(911);
            for (int wave = 1; wave <= 5; wave++)
            {
                int roofCount = 0, sniperCount = 0;
                colors.Clear();
                for (int i = 0; i < 6 + wave * 4; i++)
                {
                    var spawn = CityLayout.DefenseSpawn(random, wave, i);
                    if (!float.IsNaN(spawn.SurfaceY)) roofCount++;
                    else Check(spawn.Kind == EnemyKind.Rusher && Mathf.Abs(spawn.Pos.x) <= 6f, "도로 진입 경로 오류");
                    if (spawn.Role == EnemyRole.Sniper) sniperCount++; else colors.Add(spawn.UniformVariant);
                }
                Check(roofCount == 4 && sniperCount == 2 && colors.SetEquals(new[] { 0, 1, 2 }), "방어전 병과 배치 오류");
            }
            Debug.Log("[Sniper Ridge] 도시 배치 검사 통과: 저격 6옥상/4도로, 방어전 각 웨이브 4옥상, 발판 충돌체와 3색 군복. 실제 조준·엄폐는 Play에서 확인하세요.");
        }
        static void Check(bool condition, string message)
        { if (!condition) throw new InvalidOperationException("[도시 검사] " + message); }
    }
}
