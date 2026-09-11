using UnityEngine;

namespace SniperRidge
{
    /// <summary>Keep the player's shot attacks audible during squad fire and environmental noise.</summary>
    public sealed class GunshotPlayback : MonoBehaviour
    {
        const int Voices = 12;
        readonly AudioSource[] sources = new AudioSource[Voices];
        GameManager gm;
        int nextVoice;
        float duckUntil;
        public void Initialize(GameManager game)
        {
            gm = game;
            for (int i = 0; i < sources.Length; i++)
            {
                var source = gameObject.AddComponent<AudioSource>();
                source.playOnAwake = false;
                source.spatialBlend = 0f;
                source.priority = 32;
                sources[i] = source;
            }
        }
        public void Play(string id, float volume)
        {
            var clip = gm.Sounds.Shot(id, gm.Map == BattlefieldMap.City && gm.Mission != MissionType.Helicopter);
            if (clip == null) return;
            int voice = nextVoice;
            for (int i = 0; i < sources.Length; i++)
            {
                int candidate = (nextVoice + i) % sources.Length;
                if (!sources[candidate].isPlaying) { voice = candidate; break; }
            }
            var source = sources[voice];
            source.Stop(); source.clip = clip; source.pitch = 1f;
            source.volume = Mathf.Clamp01(volume); source.Play();
            nextVoice = (voice + 1) % sources.Length;
            duckUntil = Time.unscaledTime + .12f;
            if (gm.Ambience != null) gm.Ambience.volume = .12f;
        }
        void Update()
        {
            if (gm == null || gm.Ambience == null) return;
            float target = Time.unscaledTime < duckUntil || gm.Mission == MissionType.Tank ? .12f : .35f;
            gm.Ambience.volume = Mathf.MoveTowards(gm.Ambience.volume, target, Time.unscaledDeltaTime * .9f);
        }
    }
}
