using UnityEngine;

namespace SniperRidge
{
    public class PlayerHealth : MonoBehaviour
    {
        public float Max = 100f;
        public float Current { get; private set; } = 100f;
        public float Fraction => Current / Max;

        float regenDelay = 5f, regenRate = 6f;
        float lastHitTime = -99f;
        bool hulkForm;
        float humanMax;

        // Preserve the health fraction in both directions; toggling must never heal damage.
        public void SetHulkForm(bool active)
        {
            if (hulkForm == active) return;
            float fraction = Mathf.Clamp01(Fraction);
            if (active) humanMax = Max;
            Max = active ? humanMax * 2f : humanMax;
            Current = Max * fraction;
            hulkForm = active;
        }

        public void Configure(float delay, float rate)
        {
            regenDelay = delay;
            regenRate = rate;
            Current = Max;
        }

        public void TakeDamage(float amount,bool bypassResistance=false)
        {
            var gm = GameManager.Instance;
            if (gm == null || !gm.IsPlaying) return;
            if(!bypassResistance && gm.Player != null && gm.Player.IsHulk)amount*=.35f;
            Current = Mathf.Max(0f, Current - amount);
            if(amount>0f && Current>0f && gm.Player != null && gm.Player.IsHulk)gm.Player.Hulk.NotifyHit();
            lastHitTime = Time.time;
            gm.Hud.FlashDamage();
            gm.PlaySound(gm.Sounds.Crack, 0.9f, 0.8f);
            if (Current <= 0f) gm.PlayerDied();
        }

        void Update()
        {
            var gm = GameManager.Instance;
            if (gm != null && gm.IsPlaying && (gm.Player.IsHidden || gm.Player.IsMounted || gm.Player.IsFreeRoam) && Current > 0f && Current < Max && Time.time - lastHitTime > regenDelay)
                Current = Mathf.Min(Max, Current + regenRate * Time.deltaTime);
        }
    }
}
