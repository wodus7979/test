using UnityEngine;

namespace SniperRidge
{
    /// <summary>Reversible cover choreography in unscaled soldier metres. Feet move in separate phases.</summary>
    public struct EnemyCoverPose
    {
        public Vector3 Pelvis, LeftFoot, RightFoot;
        public float HipRoll, ChestRoll, ChestPitch, ShoulderTurn, WeaponRaise;
        public bool CanFire;

        public static EnemyCoverPose Sample(bool tree, float exposure, int side)
        {
            float t = Mathf.Clamp01(exposure);
            float sign = side < 0 ? -1f : 1f;
            var pose = new EnemyCoverPose();
            if (tree)
            {
                // Shift onto the supporting leg, step out, then bring the trailing foot across.
                float lead = Ease(t, .10f, .62f), trail = Ease(t, .64f, .94f);
                float weight = Ease(t, .20f, .88f);
                float anticipation = Lift(t, 0f, .35f);
                var outer = new Vector3(sign * .66f * lead, .11f * Lift(t, .10f, .62f), .04f * lead);
                var inner = new Vector3(sign * .22f * trail, .07f * Lift(t, .64f, .94f), -.06f * trail);
                pose.LeftFoot = side < 0 ? outer : inner;
                pose.RightFoot = side < 0 ? inner : outer;
                pose.Pelvis = new Vector3(sign * (.50f * weight - .045f * anticipation), -.12f - .08f * weight - .035f * anticipation, -.025f * anticipation);
                pose.HipRoll = -7f * sign * weight;
                pose.ChestRoll = -18f * sign * Ease(t, .55f, .96f);
                pose.ChestPitch = 5f + 4f * anticipation;
                pose.ShoulderTurn = sign * 12f * Lift(t, 0f, .96f);
            }
            else
            {
                // A low, staggered crouch rises through the knees before the shoulders square up.
                float rise = Ease(t, .12f, .90f);
                float brace = 1f - Ease(t, 0f, .22f);
                pose.LeftFoot = new Vector3(-.035f, 0f, .10f);
                pose.RightFoot = new Vector3(.035f, 0f, -.14f);
                pose.Pelvis = new Vector3(sign * .035f * brace, -.76f + .69f * rise, -.07f * (1f - rise));
                pose.ChestPitch = 19f * (1f - rise) + 3f;
                pose.ShoulderTurn = sign * 9f * (1f - Ease(t, .32f, .92f));
            }
            pose.WeaponRaise = Ease(t, .34f, .95f);
            pose.CanFire = t >= .98f;
            return pose;
        }

        static float Ease(float t, float start, float end)
        {
            float x = Mathf.InverseLerp(start, end, t);
            return x * x * x * (x * (x * 6f - 15f) + 10f);
        }

        static float Lift(float t, float start, float end)
        {
            if (t <= start || t >= end) return 0f;
            float sine = Mathf.Sin(Mathf.PI * Mathf.InverseLerp(start, end, t));
            return sine * sine;
        }
    }
}
