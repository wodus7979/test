using System;
using UnityEditor;
using UnityEngine;

namespace SniperRidge.EditorTools
{
    /// <summary>Deterministic checks against the production geometry and contact state.</summary>
    public static class CounterfireValidation
    {
        [MenuItem("Sniper Ridge/엄폐와 적 사격 검사")]
        public static void Validate()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode)
                throw new InvalidOperationException("Play를 종료한 뒤 검사를 실행하세요.");
            ValidateCapsule();
            ValidateContact();
            ValidateCover();
            Debug.Log("[Sniper Ridge] 엄폐와 적 사격 검사 통과: 탄 경로, 회피, 엄폐물 우선 충돌, 발각/추적 해제. 실제 플레이 확인도 필요합니다.");
        }

        static void Check(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("Counterfire check failed: " + message);
        }

        static void ValidateCapsule()
        {
            Vector3 bottom = new Vector3(0f, .3f, 0f);
            Vector3 top = new Vector3(0f, CounterfireRules.StandingEye - .1f, 0f);
            Vector3 from = new Vector3(0f, 1.47f, 10f), to = new Vector3(0f, 1.47f, -1f);
            float radius = CounterfireRules.PlayerRadius;
            float hit = CounterfireRules.CapsuleHit(from, to, bottom, top, radius);
            Check(Mathf.Abs(hit - 9.75f) < .001f, "standing torso hit / first entry distance");
            Check(float.IsPositiveInfinity(CounterfireRules.CapsuleHit(from, to,
                bottom + Vector3.right, top + Vector3.right, radius)), "sidestep after shot avoids fixed ray");
            Check(float.IsPositiveInfinity(CounterfireRules.CapsuleHit(from, to, bottom,
                new Vector3(0f, CounterfireRules.HiddenEye - .1f, 0f), radius)), "duck after shot avoids standing-height ray");
            Check(float.IsPositiveInfinity(CounterfireRules.CapsuleHit(from, new Vector3(0f, 1.47f, 1f), bottom, top, radius)), "short segment cannot hit beyond its end");
            Check(CounterfireRules.CapsuleHit(top, top, bottom, top, radius) == 0f, "zero-length segment inside capsule");
            Check(float.IsPositiveInfinity(CounterfireRules.CapsuleHit(from, from, bottom, top, radius)), "zero-length segment outside capsule");
            Check(Mathf.Abs(CounterfireRules.CapsuleHit(new Vector3(0f, 3f, 0f), Vector3.zero,
                bottom, top, radius) - 1.20f) < .001f, "vertical ray hits upper cap");
            Check(Mathf.Abs(CounterfireRules.CapsuleHit(new Vector3(0f, -1f, 0f), Vector3.up * 3f,
                bottom, top, radius) - 1.05f) < .001f, "vertical ray hits lower cap");
            Check(float.IsPositiveInfinity(CounterfireRules.CapsuleHit(new Vector3(.26f, 1f, 1f),
                new Vector3(.26f, 1f, -1f), bottom, top, radius)), "narrow miss stays a miss");
            // Sweeping is independent of render rate, including a 100 ms frame.
            foreach (float frame in new[] { 1f / 144f, 1f / 60f, 1f / 30f, .1f })
            {
                bool collided = false;
                Vector3 pos = from;
                for (int i = 0; i < 1000 && pos.z > -2f; i++)
                {
                    Vector3 next = pos + Vector3.back * (500f * frame);
                    collided |= !float.IsPositiveInfinity(CounterfireRules.CapsuleHit(pos, next, bottom, top, radius));
                    pos = next;
                }
                Check(collided, "no tunnelling at frame length " + frame);
            }
            Check(CounterfireRules.FlightSeconds(10f) >= .45f, "close-range reaction window");
            Check(CounterfireRules.FlightSeconds(1000f) <= 1.1f, "bounded long-range flight");
        }

        static void ValidateContact()
        {
            var contact = new SniperContact();
            Vector3 known = new Vector3(1f, 1.47f, 0f);
            Check(!contact.Revealed, "mission starts concealed");
            contact.Reveal(known);
            Check(contact.Revealed && contact.LastKnownPosition == known, "failed shot reveals its origin");
            contact.Tick(4f, true, false, Vector3.down);
            Check(contact.Revealed && contact.HiddenSeconds == 4f && contact.LastKnownPosition == known,
                "enemies remember old position, not concealed eye");
            contact.Tick(.1f, false, true, Vector3.right);
            Check(contact.HiddenSeconds == 0f && contact.LastKnownPosition == Vector3.right, "standing interrupts hiding and updates visible position");
            contact.Tick(4.9f, true, false, known);
            Check(contact.Revealed, "cannot clear early");
            contact.Reveal(known);
            Check(contact.HiddenSeconds == 0f, "another failed shot resets contact timer");
            contact.Tick(5.1f, true, false, Vector3.down);
            Check(!contact.Revealed, "continuous cover clears contact");
            contact.Tick(10f, false, true, Vector3.right);
            Check(!contact.Revealed, "standing after escape does not automatically reveal again");
            contact.Reveal(known);
            contact.Tick(6f, true, true, Vector3.right);
            Check(contact.Revealed && contact.HiddenSeconds == 0f, "a visible crouch does not clear contact");
        }

        static void ValidateCover()
        {
            // Temporary colliders outside the generated map; never edit scene assets.
            var root = new GameObject("CounterfireValidation") { hideFlags = HideFlags.HideAndDontSave };
            root.transform.position = new Vector3(10000f, 1000f, 10000f);
            try
            {
                var wall = new GameObject("TestCover");
                wall.transform.SetParent(root.transform, false);
                wall.transform.localPosition = new Vector3(0f, CounterfireRules.CoverHeight / 2f, 1.18f);
                var box = wall.AddComponent<BoxCollider>();
                box.size = new Vector3(4.9f, CounterfireRules.CoverHeight, .32f);
                Physics.SyncTransforms();
                Vector3 origin = root.transform.position;
                Vector3 from = origin + new Vector3(0f, .55f, 10f);
                Vector3 to = origin + new Vector3(0f, .55f, -1f);
                Check(EnemyProjectile.WorldHit(from, to, null, out RaycastHit obstruction) && obstruction.collider == box,
                    "sandbag core stops low shot");
                float body = CounterfireRules.CapsuleHit(from, to, origin + Vector3.up * .3f,
                    origin + Vector3.up * (CounterfireRules.HiddenEye - .1f), CounterfireRules.PlayerRadius);
                Check(obstruction.distance < body, "cover hit occurs before crouched player hit");
                Check(!EnemyProjectile.WorldHit(origin + new Vector3(0f, 1.47f, 10f),
                    origin + new Vector3(0f, 1.47f, -1f), null, out _), "standing shot clears cover");
                var shooter = new GameObject("TestShooter");
                shooter.transform.SetParent(root.transform, false);
                shooter.transform.localPosition = new Vector3(0f, .55f, 8f);
                var owner = shooter.AddComponent<EnemySoldier>();
                shooter.AddComponent<BoxCollider>();
                Physics.SyncTransforms();
                Check(EnemyProjectile.WorldHit(from, to, owner, out obstruction) && obstruction.collider == box,
                    "ignore shooter without ignoring cover behind it");
                // Overflow the non-alloc buffer with excluded self colliders. The real
                // wall still has to be found by the complete-query fallback.
                for (int i = 0; i < 40; i++)
                {
                    var part = new GameObject("SelfCollider");
                    part.transform.SetParent(shooter.transform, false);
                    part.transform.localPosition = new Vector3(0f, 0f, -i * .1f);
                    part.AddComponent<BoxCollider>().size = Vector3.one * .05f;
                }
                Physics.SyncTransforms();
                Check(EnemyProjectile.WorldHit(from, to, owner, out obstruction) && obstruction.collider == box,
                    "full raycast buffer cannot lose the actual cover");
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }
    }
}
