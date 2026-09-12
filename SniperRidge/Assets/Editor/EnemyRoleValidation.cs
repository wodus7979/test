using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class EnemyRoleValidation
    {
        [MenuItem("Sniper Ridge/병과·군복 색상 검사")]
        public static void Validate()
        {
            FPSWeaponsV2Setup.BuildIfMissing();
            CheckSquad(BattlefieldLayout.SniperSpawns(), 4);
            var random = new System.Random(911);
            for (int wave = 1; wave <= 5; wave++)
            {
                var squad = new List<EnemySpawn>();
                for (int i = 0; i < 6 + wave * 4; i++)
                {
                    var spawn = BattlefieldLayout.DefenseSoldier(random, wave, i);
                    float range = Vector2.Distance(BattlefieldLayout.PlayerXZ, spawn.Pos);
                    Check(range >= 55f && range <= 95f, "방어전 배치 거리 오류");
                    if (spawn.Role == EnemyRole.Sniper)
                        Check(spawn.Pos == BattlefieldLayout.DefenseSniperSpawn(i), "웨이브 사이 저격 엄폐물 위치가 달라집니다.");
                    squad.Add(spawn);
                }
                CheckSquad(squad, 2);
            }
            foreach (var role in new[] { EnemyRole.MachineGunner, EnemyRole.Sniper })
                Check(WeaponModels.LoadPrefab(EnemyCombatRoles.Model(role)) != null, "병과별 총기 프리팹 누락");
            var prefab = EnemyModels.Prefab;
            Check(prefab != null, "병사 프리팹 누락");
            foreach (var renderer in prefab.GetComponentsInChildren<SkinnedMeshRenderer>())
                foreach (var material in renderer.sharedMaterials)
                    Check(material.HasProperty("_UniformColor"), "군복 셰이더 누락: 적 애니메이션 다시 생성 메뉴를 실행하세요.");
            Check(EnemyCombatRoles.Rounds(EnemyRole.MachineGunner) == 3 && EnemyCombatRoles.Rounds(EnemyRole.Sniper) == 1,
                "병과별 발사 방식 오류");
            Check(EnemyCombatRoles.AimTime(EnemyRole.Sniper) > EnemyCombatRoles.AimTime(EnemyRole.MachineGunner), "저격 경고 시간 오류");
            Debug.Log("[Sniper Ridge] 병과 검사 통과: 저격 임무 4/6명, 방어전 각 웨이브 저격병 2명, 기관총병 3색, 무기/군복 연결.");
        }

        static void CheckSquad(List<EnemySpawn> squad, int expectedSnipers)
        {
            int snipers = 0;
            var colors = new HashSet<int>();
            foreach (var spawn in squad)
                if (EnemyCombatRoles.Resolve(spawn) == EnemyRole.Sniper)
                {
                    snipers++;
                    Check(spawn.Kind == EnemyKind.Tree || spawn.Kind == EnemyKind.Cover, "엄폐 장소가 없는 저격병");
                }
                else colors.Add(spawn.UniformVariant);
            Check(snipers == expectedSnipers && colors.SetEquals(new[] { 0, 1, 2 }), "병과 비율 또는 3색 배치 오류");
        }

        static void Check(bool condition, string message)
        { if (!condition) throw new InvalidOperationException("[병과 검사] " + message); }
    }
}
