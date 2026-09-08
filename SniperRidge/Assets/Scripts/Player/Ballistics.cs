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

}
