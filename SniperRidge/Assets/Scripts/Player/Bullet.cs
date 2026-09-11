using UnityEngine;

namespace SniperRidge
{
    /// <summary>실시간으로 비행하는 탄환. 매 프레임 작은 스텝으로 적분하며 레이캐스트로 충돌을 검사한다.</summary>
    [DefaultExecutionOrder(300)]
    public class Bullet : MonoBehaviour
    {
        Vector3 pos, vel, wind, origin;
        float traveled, dragK = Ballistics.DragK, damage = 100f;
        bool done;
        float age;
        LineRenderer lr;
        static int physicsFrame = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetPhysicsFrame() => physicsFrame = -1;

        public static void SyncHitboxesForShot()
        {
            if (physicsFrame == Time.frameCount) return;
            Physics.SyncTransforms();
            physicsFrame = Time.frameCount;
        }

        public static void Fire(Vector3 origin, Vector3 direction, Vector3 wind,
                                float muzzleVelocity = Ballistics.MuzzleVelocity, float dragK = Ballistics.DragK, float damage = 100f, Vector3 inheritedVelocity = default(Vector3))
        {
            var go = new GameObject("Bullet");
            go.transform.position = origin;
            var b = go.AddComponent<Bullet>();
            b.pos = origin;
            b.origin = origin;
            b.vel = direction.normalized * muzzleVelocity + inheritedVelocity;
            b.wind = wind;
            b.dragK = dragK;
            b.damage = damage;

            b.lr = go.AddComponent<LineRenderer>();
            b.lr.useWorldSpace = true;
            b.lr.positionCount = 2;
            b.lr.SetPosition(0, origin);
            b.lr.SetPosition(1, origin);
            b.lr.startWidth = 0.05f;
            b.lr.endWidth = 0.05f;
            b.lr.material = Effects.Unlit(new Color(1f, 0.92f, 0.6f));
            b.lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            b.lr.receiveShadows = false;
        }

        // EnemyAnimationRig finishes skeletal posing and hitboxes in LateUpdate at order 150.
        // Query after that, and explicitly flush transform changes when autoSyncTransforms is off.
        void LateUpdate()
        {
            if (done) return;
            var activeGame = GameManager.Instance;
            if (activeGame == null || !activeGame.IsPlaying) { done = true; Destroy(gameObject); return; }
            SyncHitboxesForShot();
            age += Time.deltaTime;
            if (age > 6f) { Finish(); return; }
            float remaining = Time.deltaTime;
            Vector3 frameStart = pos;
            var gm = GameManager.Instance;

            while (remaining > 0f)
            {
                float dt = Mathf.Min(0.004f, remaining);
                remaining -= dt;

                float speed = vel.magnitude;
                Vector3 acc = Vector3.down * Ballistics.Gravity - dragK * speed * (vel - wind);
                vel += acc * dt;
                Vector3 next = pos + vel * dt;
                Vector3 seg = next - pos;
                float len = seg.magnitude;
                if (len <= 0.0001f) { Finish(); return; }

                if (Physics.Raycast(pos, seg / len, out RaycastHit hit, len, EnemyRagdoll.CombatMask, QueryTriggerInteraction.Ignore))
                {
                    Impact(hit);
                    return;
                }

                if (gm != null) gm.NotifyBulletPass(pos, next);
                pos = next;
                traveled += len;
                if (traveled > 2500f || pos.y < -100f) { Finish(); return; }
            }

            lr.SetPosition(0, frameStart);
            lr.SetPosition(1, pos);
            transform.position = pos;
        }

        void Impact(RaycastHit hit)
        {
            done = true;
            var gm = GameManager.Instance;
            float dist = Vector3.Distance(origin, hit.point);
            var hitbox = hit.collider.GetComponent<EnemyHitbox>();

            if (hitbox != null && hitbox.Owner != null && !hitbox.Owner.IsDead)
            {
                bool killed = hitbox.Owner.TakeHit(damage, hitbox.IsHead, vel.normalized);
                BloodImpact.Emit(hit.point, hit.normal, vel.normalized, hitbox.IsHead);
                if (gm != null)
                {
                    gm.OnEnemyHit(hitbox.Owner, hitbox.IsHead, dist, killed);
                    gm.OnPlayerShotResolved(killed, origin);
                }
            }
            else
            {
                Effects.Dust(hit.point, hit.normal, 0.25f);
                if (gm != null)
                {
                    if (gm.Mission == MissionType.Sniper)
                        gm.Hud.ShowShotFeedback(dist < 5f ? "가까운 엄폐물에 막힘 · 사선을 높이세요" : "지형·엄폐물에 맞음");
                    gm.OnBulletImpact(hit.point);
                    gm.OnPlayerShotResolved(false, origin);
                }
            }
            Destroy(gameObject);
        }

        void Finish()
        {
            if (done) return;
            done = true;
            var gm = GameManager.Instance;
            if (gm != null)
            {
                if (gm.IsPlaying && gm.Mission == MissionType.Sniper) gm.Hud.ShowShotFeedback("명중하지 않음 · 거리와 바람을 확인하세요");
                gm.OnPlayerShotResolved(false, origin);
            }
            Destroy(gameObject);
        }
    }
}
