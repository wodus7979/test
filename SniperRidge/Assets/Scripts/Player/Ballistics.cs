using UnityEngine;

namespace SniperRidge
{
    /// <summary>탄도 계산: 중력, 공기저항, 바람, 영점.</summary>
    public static class Ballistics
    {
        public const float MuzzleVelocity = 850f;   // m/s
        public const float DragK = 0.00087f;        // 공기저항 계수 (v' = -k v^2)
        public const float Gravity = 9.81f;

        /// <summary>영점 거리에서 조준선과 탄도가 만나도록 총구를 올려야 하는 각도(도).</summary>
        public static float ZeroAngleDegrees(float zeroRange, float muzzleVelocity = MuzzleVelocity, float dragK = DragK)
        {
            float angle = 0f; // 라디안
            for (int it = 0; it < 3; it++)
            {
                float y = HeightAtRange(zeroRange, angle, muzzleVelocity, dragK);
                angle += Mathf.Atan2(-y, zeroRange);
            }
            return angle * Mathf.Rad2Deg;
        }

        /// <summary>수평 사거리 range 에 도달했을 때의 높이(음수면 조준선 아래).</summary>
        static float HeightAtRange(float range, float angle, float muzzleVelocity, float dragK)
        {
            Vector2 p = Vector2.zero;
            Vector2 v = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * muzzleVelocity;
            const float dt = 0.002f;
            for (int i = 0; i < 6000 && p.x < range; i++)
            {
                float speed = v.magnitude;
                Vector2 a = new Vector2(0f, -Gravity) - dragK * speed * v;
                v += a * dt;
                p += v * dt;
            }
            return p.y;
        }
    }

    /// <summary>실시간으로 비행하는 탄환. 매 프레임 작은 스텝으로 적분하며 레이캐스트로 충돌을 검사한다.</summary>
    public class Bullet : MonoBehaviour
    {
        Vector3 pos, vel, wind, origin;
        float traveled, dragK = Ballistics.DragK, damage = 100f;
        bool done;
        LineRenderer lr;

        public static void Fire(Vector3 origin, Vector3 direction, Vector3 wind,
                                float muzzleVelocity = Ballistics.MuzzleVelocity, float dragK = Ballistics.DragK, float damage = 100f)
        {
            var go = new GameObject("Bullet");
            go.transform.position = origin;
            var b = go.AddComponent<Bullet>();
            b.pos = origin;
            b.origin = origin;
            b.vel = direction.normalized * muzzleVelocity;
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

        void Update()
        {
            if (done) return;
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

                if (Physics.Raycast(pos, seg / len, out RaycastHit hit, len, ~0, QueryTriggerInteraction.Ignore))
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
                Effects.Puff(hit.point, -vel.normalized, 0.18f, new Color(0.55f, 0.05f, 0.05f), 0.45f);
                if (gm != null) gm.OnEnemyHit(hitbox.Owner, hitbox.IsHead, dist, killed);
            }
            else
            {
                Effects.Dust(hit.point, hit.normal, 0.25f);
                if (gm != null) gm.OnBulletImpact(hit.point);
            }
            Destroy(gameObject);
        }

        void Finish()
        {
            done = true;
            Destroy(gameObject);
        }
    }
}
