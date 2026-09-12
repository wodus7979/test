using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class HelicopterValidation
    {
        [MenuItem("Sniper Ridge/헬기 선회·중기관총 검사")]
        public static void Validate()
        {
            FPSWeaponsV2Setup.BuildIfMissing();
            var prefab = Resources.Load<GameObject>(DoorGunView.Resource);
            Check(prefab != null, "중기관총 프리팹 누락");
            var assetWeapon = prefab.transform.Find("Base/YawMount/Weapon");
            Check(assetWeapon != null && assetWeapon.Find("RearGripLeft") != null && assetWeapon.Find("RearGripRight") != null,
                "중기관총 손잡이 기준점 누락");
            Check(Resources.Load<Shader>("Shaders/BloodParticles") != null, "혈흔 셰이더 누락");
            var weapon = WeaponDefinition.Find("hmg");
            Check(weapon.Id == "hmg" && weapon.IsMounted && weapon.Mission == MissionType.Helicopter,
                "헬기 무기 설정 누락");
            Check(weapon.Fire == FireMode.Auto && weapon.MagSize == 250 && weapon.Reserve == 2000,
                "중기관총 탄띠 설정 오류");
            Check(HelicopterRescueMission.TotalSurvivors==20&&HelicopterRescueMission.SiteCount==4&&HelicopterRescueMission.SurvivorsPerSite==5,
                "구조 인원/지점 설정 오류");
            Check(HelicopterFlight.DodgeDuration>=3.5f&&HelicopterFlight.DodgeCooldownSeconds>HelicopterFlight.DodgeDuration,
                "로켓 도착 시점까지 유지되는 회피 기동 설정이 아닙니다.");
            foreach (var map in new[] { BattlefieldMap.Field, BattlefieldMap.City })
                for (int frame = 0; frame < 520; frame++)
                {
                    float time = frame * .1f;
                    var position = HelicopterFlight.Position(map, time);
                    var inward = HelicopterFlight.Centre(map) - position; inward.y = 0f;
                    var rightDoor = HelicopterFlight.Heading(time) * Vector3.right;
                    Check(Vector3.Dot(rightDoor, inward.normalized) > .995f, "옆문이 선회 바깥쪽을 향합니다.");
                    Check(Vector3.Distance(position, HelicopterFlight.Position(map, time + .1f)) < 1.2f,
                        "선회 중 순간 이동");
                }
            foreach(var map in new[]{BattlefieldMap.Field,BattlefieldMap.City})for(int i=0;i<HelicopterRescueMission.SiteCount;i++)
            {
                var site=HelicopterRescueMission.Site(map,i);var centre=HelicopterFlight.Centre(map);site.y=centre.y;
                float radial=Vector3.Distance(site,centre),orbit=map==BattlefieldMap.City?HelicopterFlight.CityRadius:HelicopterFlight.FieldRadius;
                Check(Mathf.Abs(orbit-radial)<=HelicopterRescueMission.PickupRadius,"구조 지점에 헬기가 접근할 수 없습니다.");
            }
            foreach (var name in new[] { "helicopter_rotor", "helicopter_engine", "shot_hmg", "shot_hmg_02", "shot_hmg_03", "shot_hmg_04" })
            {
                var clip = Resources.Load<AudioClip>("Audio/" + name);
                Check(clip != null && clip.channels == 2 && clip.frequency == 48000, "오디오 누락/형식: " + name);
                var importer = AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(clip)) as AudioImporter;
                Check(importer != null && importer.defaultSampleSettings.compressionFormat == AudioCompressionFormat.PCM,
                    "오디오 다시 가져오기 필요: " + name);
            }
            // When invoked during an air mission, also inspect the actual mounted rig.
            var game = GameManager.Instance;
            if (Application.isPlaying && game != null && game.Mission == MissionType.Helicopter && game.IsPlaying)
            {
                Check(game.Flight != null && game.Player.IsMounted, "헬기 사수 연결 누락");
                Check(game.Rescue!=null&&game.Rescue.Rescued<=HelicopterRescueMission.TotalSurvivors,"헬기 구조 임무 연결 누락");
                Check(game.Player.transform.parent == game.Flight.GunnerStation, "사수가 기체에 고정되지 않았습니다.");
                var muzzle = game.Flight.GunnerStation.Find("Mounted Heavy Machine Gun/Base/YawMount/Weapon/Muzzle");
                Check(muzzle != null, "중기관총 총구 누락");
                var gun = muzzle.parent;
                Check(gun.Find("RearGripLeft/Left gripping hand") != null && gun.Find("RearGripRight/Right gripping hand") != null,
                    "양손 모델 누락");
                Check((game.Player.Eye.GetComponent<Camera>().cullingMask & (1 << DoorGunView.ViewLayer)) == 0,
                    "주 카메라와 총기 카메라가 중복 렌더링합니다.");
                foreach (var collider in game.Flight.GetComponentsInChildren<Collider>())
                    Check(!collider.enabled, "헬기 시각 모델이 탄환을 가로막습니다.");
            }
            Debug.Log("[Sniper Ridge] 헬기 선회 방향·속도, 중기관총 설정과 PCM 오디오 검사 통과. Play에서 시야·명중·연사·소리를 확인하세요.");
        }
        static void Check(bool valid, string message)
        { if (!valid) throw new InvalidOperationException("[헬기 검사] " + message); }
    }
}
