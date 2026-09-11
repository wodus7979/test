using System;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    public static class CoverAndAudioValidation
    {
        [MenuItem("Sniper Ridge/엄폐 동작·녹음 총성 검사")]
        public static void Validate()
        {
            ValidateFootwork();
            string[] ids = { "sniper", "dmr", "rifle", "lmg", "smg", "shotgun", "pistol", "distant" };
            int total = 0;
            foreach (string id in ids)
            {
                var clips = Resources.LoadAll<AudioClip>("Audio")
                    .Where(c => c.name == "shot_" + id || c.name.StartsWith("shot_" + id + "_", StringComparison.Ordinal)).ToArray();
                Check(clips.Length >= 2, "별도 녹음 테이크 누락: " + id);
                if (id != "distant") Check(clips.Any(c => c.name == "shot_" + id + "_city"), "도시 총성 누락: " + id);
                foreach (var clip in clips)
                {
                    Check(clip.frequency == 48000 && clip.channels == (id == "distant" ? 1 : 2), "PCM 형식: " + clip.name);
                    var importer = AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(clip)) as AudioImporter;
                    Check(importer != null && importer.defaultSampleSettings.compressionFormat == AudioCompressionFormat.PCM &&
                        importer.GetOverrideSampleSettings("Standalone").compressionFormat == AudioCompressionFormat.PCM, "총성 압축 설정: " + clip.name);
                }
                total += clips.Length;
            }
            var prefab = Resources.Load<GameObject>("Enemies/SoldierModel");
            var rig = prefab != null ? prefab.GetComponent<EnemyAnimationRig>() : null;
            Check(rig != null && rig.SetupVersion == EnemyAnimationRig.CurrentVersion,
                "적 애니메이션 다시 생성 메뉴를 실행하세요.");
            var animator = prefab.GetComponent<Animator>();
            Check(animator != null && animator.runtimeAnimatorController != null, "병사 Animator 누락");
            Debug.Log("[Sniper Ridge] 엄폐 발 디딤/복귀/사격 자세와 총성 파일 " + total + "개 검사 통과. 실제 동작과 소리는 Play에서도 확인하세요.");
        }

        public static void ValidateFootwork()
        {
            foreach (bool tree in new[] { false, true }) foreach (int side in new[] { -1, 1 })
            {
                var previous = EnemyCoverPose.Sample(tree, 0f, side);
                // Out and back: interruption/reversal must not teleport or move a planted foot.
                for (int frame = 1; frame <= 400; frame++)
                {
                    float exposure = frame <= 200 ? frame / 200f : (400 - frame) / 200f;
                    var pose = EnemyCoverPose.Sample(tree, exposure, side);
                    Check(pose.LeftFoot.y >= 0f && pose.RightFoot.y >= 0f, "발이 지면 아래로 내려갑니다.");
                    Check(pose.LeftFoot.y < .00001f || pose.RightFoot.y < .00001f, "지지하는 발이 없습니다.");
                    Check(Vector3.Distance(previous.Pelvis, pose.Pelvis) < .03f &&
                        Vector3.Distance(previous.LeftFoot, pose.LeftFoot) < .03f &&
                        Vector3.Distance(previous.RightFoot, pose.RightFoot) < .03f, "엄폐 전환 중 순간 이동");
                    Planted(previous.LeftFoot, pose.LeftFoot);
                    Planted(previous.RightFoot, pose.RightFoot);
                    if (pose.CanFire) Check(pose.LeftFoot.y == 0f && pose.RightFoot.y == 0f && pose.WeaponRaise > .99f,
                        "발을 디디기 전에 사격 가능 상태가 됩니다.");
                    previous = pose;
                }
                var hidden = EnemyCoverPose.Sample(tree, 0f, side);
                var exposed = EnemyCoverPose.Sample(tree, 1f, side);
                Check(!hidden.CanFire && exposed.CanFire, "엄폐 사격 상태 오류");
                if (tree) Check(hidden.LeftFoot == Vector3.zero && hidden.RightFoot == Vector3.zero, "복귀한 발 위치 오류");
                else Check(exposed.Pelvis.y - hidden.Pelvis.y > .5f, "바위 뒤 일어서기 높이 부족");
            }
        }

        static void Planted(Vector3 before, Vector3 after)
        {
            if (before.y == 0f && after.y == 0f)
                Check(Vector3.Distance(before, after) < .00001f, "딛고 있는 발이 미끄러집니다.");
        }
        static void Check(bool valid, string message)
        { if (!valid) throw new InvalidOperationException("[엄폐/총성 검사] " + message); }
    }
}
