using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class FlatBattlefieldValidation
    {
        [MenuItem("Sniper Ridge/평지 전투 배치 검사 (Play 중)")]
        public static void Validate()
        {
            var gm = GameManager.Instance;
            if (!EditorApplication.isPlaying || gm == null || gm.Terrain == null)
                throw new InvalidOperationException("Play를 시작하고 전장이 생성된 뒤 검사하세요.");
            Vector2 player = BattlefieldLayout.PlayerXZ;
            for (float x = -290f; x <= 290f; x += 20f)
                for (float z = -290f; z <= 290f; z += 20f)
                {
                    if (Vector2.Distance(new Vector2(x, z), player) < 12f) continue;
                    Check(Mathf.Abs(TerrainGenerator.GroundHeight(gm.Terrain, x, z) - TerrainGenerator.FieldElevation) < .015f,
                        "참호 밖 지형에 높이차가 있습니다.");
                }
            Check(Mathf.Abs(gm.Player.transform.position.y - (TerrainGenerator.FieldElevation - TrenchTerrain.FiringStepDepth)) < .03f,
                "플레이어가 평지 참호 바닥에 있지 않습니다.");
            var terrainCollider = gm.Terrain.GetComponent<TerrainCollider>();
            Vector3 eye = gm.Player.transform.position + Vector3.up * CounterfireRules.StandingEye;
            int count = 0;
            foreach (var spawn in BattlefieldLayout.SniperSpawns())
            {
                foreach (var point in spawn.Kind == EnemyKind.Patrol ? new[] { spawn.Pos, spawn.PosB } : new[] { spawn.Pos })
                {
                    float range = Vector2.Distance(player, point);
                    Check(range >= 45f && range <= 106f, "저격 적 거리가 설정 범위를 벗어났습니다: " + range);
                    Check(BattlefieldLayout.IsCombatLane(point.x, point.y), "적 배치가 전방 시야 확보 구역 밖입니다.");
                    Vector3 target = TerrainGenerator.OnGround(gm.Terrain, point.x, point.y, 1.55f * EnemySoldier.SniperModeScale);
                    Vector3 direction = target - eye;
                    Check(!terrainCollider.Raycast(new Ray(eye, direction.normalized), out _, direction.magnitude),
                        "평지 지형이 서 있는 적의 사선을 막습니다.");
                    count++;
                }
            }
            var random = new System.Random(618);
            for (int wave = 1; wave <= 5; wave++) for (int i = 0; i < 200; i++)
            {
                Vector2 point = BattlefieldLayout.DefenseSpawn(random, wave);
                float range = Vector2.Distance(player, point);
                Check(range >= 55f && range <= 95f && BattlefieldLayout.IsCombatLane(point.x, point.y), "방어전 생성 위치 오류");
            }
            foreach (var definition in WeaponDefinition.All)
                if (definition.HasZeroing)
                {
                    var loadout = new WeaponLoadout(); loadout.Reset(definition);
                    Check(loadout.Primary.Zero == 100 && definition.ScopeFovs[definition.DefaultZoomIndex] == 15f,
                        "가까운 전투용 기본 영점/배율 오류");
                }
            Debug.Log("[Sniper Ridge] 평지 배치 검사 통과: 참호 외 평탄도, 플레이어 발판, 저격/순찰 사선 " + count +
                "개, 방어전 생성 위치 1,000개, 기본 영점/배율. 엄폐 동작과 실제 적 가시성도 Play에서 확인하세요.");
        }
        static void Check(bool condition, string message)
        { if (!condition) throw new InvalidOperationException("[평지 검사] " + message); }
    }
}
