using UnityEngine;

namespace SniperRidge
{
    /// <summary>Shared cover dimensions, exposure state and swept projectile hit geometry.</summary>
    public static class CounterfireRules
    {
        public const float StandingEye = 1.65f;
        public const float HiddenEye = .58f;
        public const float CoverHeight = 1.16f;
        public const float PlayerRadius = .25f;
        public const float LoseContactSeconds = 5f;

        // Intentionally readable, slower-than-real flight for the dodge/cover game loop.
        public static float FlightSeconds(float distance) => Mathf.Clamp(distance / 500f, .45f, 1.1f);

        /// <summary>First intersection distance with a vertical capsule; infinity means no hit.</summary>
        public static float CapsuleHit(Vector3 from, Vector3 to, Vector3 bottom, Vector3 top, float radius)
        {
            Vector3 segment = to - from;
            float length = segment.magnitude;
            Vector3 closest = new Vector3(bottom.x, Mathf.Clamp(from.y, bottom.y, top.y), bottom.z);
            if ((from - closest).sqrMagnitude <= radius * radius) return 0f;
            if (length < .00001f) return float.PositiveInfinity;
            Vector3 dir = segment / length;
            float best = Mathf.Min(SphereHit(from, dir, bottom, radius), SphereHit(from, dir, top, radius));
            Vector3 offset = from - bottom;
            float a = dir.x * dir.x + dir.z * dir.z;
            float b = offset.x * dir.x + offset.z * dir.z;
            float c = offset.x * offset.x + offset.z * offset.z - radius * radius;
            float disc = b * b - a * c;
            if (a > .000001f && disc >= 0f)
            {
                float root = Mathf.Sqrt(disc);
                for (int i = 0; i < 2; i++)
                {
                    float d = (-b + (i == 0 ? -root : root)) / a;
                    float y = from.y + dir.y * d;
                    if (d >= 0f && y >= bottom.y && y <= top.y) best = Mathf.Min(best, d);
                }
            }
            return best <= length ? best : float.PositiveInfinity;
        }

        static float SphereHit(Vector3 from, Vector3 dir, Vector3 centre, float radius)
        {
            Vector3 offset = from - centre;
            float b = Vector3.Dot(offset, dir);
            float c = offset.sqrMagnitude - radius * radius;
            if (c <= 0f) return 0f;
            float disc = b * b - c;
            if (disc < 0f) return float.PositiveInfinity;
            float d = -b - Mathf.Sqrt(disc);
            return d >= 0f ? d : float.PositiveInfinity;
        }
    }

    public sealed class SniperContact
    {
        public bool Revealed { get; private set; }
        public float HiddenSeconds { get; private set; }
        public Vector3 LastKnownPosition { get; private set; }

        public void Reveal(Vector3 shotPosition)
        {
            Revealed = true;
            HiddenSeconds = 0f;
            LastKnownPosition = shotPosition;
        }

        public void Tick(float dt, bool hidden, bool visibleToEnemy, Vector3 position)
        {
            if (!Revealed) return;
            if (visibleToEnemy) LastKnownPosition = position;
            HiddenSeconds = hidden && !visibleToEnemy ? HiddenSeconds + dt : 0f;
            if (HiddenSeconds >= CounterfireRules.LoseContactSeconds)
            {
                Revealed = false;
                HiddenSeconds = 0f;
            }
        }
    }
}
