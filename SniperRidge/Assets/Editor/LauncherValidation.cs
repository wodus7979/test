using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using OriginalLauncherAssets;

namespace SniperRidge.EditorTools
{
    public static class LauncherValidation
    {
        [MenuItem("Sniper Ridge/로켓포 에셋·탄약·폭발 검사")]
        public static void Validate()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Play를 중지한 뒤 검사하세요.");
            LauncherPackBuilder.BuildIfMissing();
            FPSWeaponsV2Setup.BuildIfMissing();
            ValidateInventory();
            foreach (string name in new[] { "launcher_reusable", "launcher_compact", "launcher_heavy" })
            {
                var prefab = WeaponModels.LoadPrefab(name);
                Check(prefab != null && WeaponModels.FindMuzzle(prefab) != null, "프리팹 또는 총구 누락: " + name);
                foreach (var renderer in prefab.GetComponentsInChildren<MeshRenderer>())
                    foreach (var material in renderer.sharedMaterials)
                        Check(material != null && material.shader != null && material.shader.isSupported, "로켓포 재질/셰이더 오류");
                foreach (var collider in prefab.GetComponentsInChildren<Collider>()) Check(!collider.enabled, "1인칭 무기 콜라이더가 켜져 있습니다.");
                var model = JsonUtility.FromJson<LauncherPackBuilder.Model>(File.ReadAllText("Assets/LauncherAssetPack/Source/" + name + ".json"));
                foreach (var lod in model.lods)
                {
                    Mesh mesh = LauncherPackBuilder.MakeMesh(lod, name);
                    try
                    {
                        var v = mesh.vertices; var n = mesh.normals; var indices = mesh.triangles;
                        for (int i = 0; i < indices.Length; i += 3)
                        {
                            int a = indices[i], b = indices[i + 1], c = indices[i + 2];
                            Check(Vector3.Dot(Vector3.Cross(v[b] - v[a], v[c] - v[a]), n[a] + n[b] + n[c]) < 0f,
                                "Launcher source reflection/winding mismatch: " + name);
                        }
                    }
                    finally { UnityEngine.Object.DestroyImmediate(mesh); }
                }
            }
            Check(Resources.Load<AudioClip>("Audio/rocket_launch") != null, "발사음 누락");
            Check(Resources.Load<AudioClip>("Audio/rocket_explosion") != null, "폭발음 누락");
            Check(Shader.Find("SniperRidge/RocketParticles") != null, "연기 셰이더 누락");
            ValidateBlast();
            Debug.Log("[Sniper Ridge] 로켓포 검사 통과: 3종 프리팹·재질·방향, 탄약 보존·재보급, 폭발 중복 방지·엄폐·반경. Play에서 Q 전환과 실제 발사를 확인하세요.");
        }

        static void ValidateInventory()
        {
            foreach (var weapon in WeaponDefinition.All)
            {
                var inventory = new WeaponLoadout(); inventory.Reset(weapon);
                inventory.Primary.Magazine--;
                inventory.Primary.Reserve -= 3;
                inventory.Primary.Zoom = weapon.ScopeFovs.Length - 1;
                inventory.Primary.Zero = 450;
                inventory.Primary.ReadyAt = 123f;
                inventory.Toggle(); inventory.Active.Magazine--;
                for (int i = 0; i < 20; i++) inventory.Toggle();
                Check(inventory.Active == inventory.Rocket && inventory.Active.Magazine == 0 && inventory.Active.Reserve == 8,
                    "교체가 로켓탄을 생성했습니다.");
                inventory.Active.FinishReload();
                Check(inventory.Active.Magazine == 1 && inventory.Active.Reserve == 7, "로켓 재장전 탄수 오류");
                int primaryAdded = inventory.Primary.Supply(9999);
                Check(primaryAdded == 3 && inventory.Active.Reserve == 7, "주무기 보급이 로켓탄에 적용됐습니다.");
                Check(inventory.Rocket.Supply(2) == 1 && inventory.Rocket.Reserve == 8, "로켓 보급 상한 오류");
                inventory.Toggle();
                Check(inventory.Active.Definition == weapon && inventory.Active.Magazine == weapon.MagSize - 1 &&
                    inventory.Active.Zoom == weapon.ScopeFovs.Length - 1 && inventory.Active.Zero == 450 && inventory.Active.ReadyAt == 123f,
                    "주무기 탄약/조준/쿨다운이 교체 중 초기화됐습니다.");
                inventory.Active.Reserve = 0; inventory.Active.Magazine = 0;
                inventory.Active.FinishReload();
                Check(inventory.Active.Magazine == 0, "빈 예비탄에서 장전했습니다.");
                inventory.Reset(weapon);
                Check(inventory.Primary.Magazine == weapon.MagSize && inventory.Rocket.Reserve == 8, "새 임무 탄약 초기화 오류");
            }
        }

        static void ValidateBlast()
        {
            Check(RocketProjectile.BlastDamage(0f, 220f) == 220f, "중심 피해 오류");
            Check(RocketProjectile.BlastDamage(8f, 220f) == 0f, "폭발 반경 밖에 피해가 있습니다.");
            Scene previous = SceneManager.GetActiveScene();
            Scene fixture = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
            SceneManager.SetActiveScene(fixture);
            try
            {
                Vector3 centre = new Vector3(-20000f, 5000f, -20000f);
                var visible = Enemy(centre + Vector3.forward * 2f);
                var hidden = Enemy(centre + Vector3.right * 3f);
                var far = Enemy(centre + Vector3.forward * 9f);
                var wall = new GameObject("BlastTestWall");
                wall.transform.position = centre + Vector3.right * 1.5f;
                wall.AddComponent<BoxCollider>().size = new Vector3(.3f, 4f, 2f);
                Physics.SyncTransforms();
                var targets = RocketProjectile.FindBlastTargets(centre, 220f);
                Check(targets.Count == 1 && targets.ContainsKey(visible), "복수 신체 콜라이더가 중복됐거나 엄폐/반경 판정이 잘못됐습니다.");
                Check(!targets.ContainsKey(hidden) && !targets.ContainsKey(far), "벽 뒤/반경 밖 적에게 폭발 피해가 전달됐습니다.");
                Check(RocketProjectile.FindBlastTargets(centre, 220f, hidden)[hidden] == 220f, "직격 피해가 누락됐습니다.");
            }
            finally
            {
                SceneManager.SetActiveScene(previous);
                EditorSceneManager.CloseScene(fixture, true);
                Physics.SyncTransforms();
            }
        }

        static EnemySoldier Enemy(Vector3 position)
        {
            var root = new GameObject("BlastTestEnemy"); root.transform.position = position;
            var enemy = root.AddComponent<EnemySoldier>();
            foreach (float x in new[] { -.12f, .12f })
            {
                var child = new GameObject("Hitbox"); child.transform.SetParent(root.transform, false);
                child.transform.localPosition = Vector3.right * x;
                child.AddComponent<SphereCollider>().radius = .25f;
                child.AddComponent<EnemyHitbox>().Owner = enemy;
            }
            return enemy;
        }
        static void Check(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("[로켓포 검사] " + message);
        }
    }
}
