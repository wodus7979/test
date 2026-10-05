using UnityEngine;
namespace SniperRidge
{
    public sealed class HulkAudio : MonoBehaviour
    {
        public enum Cue { Transform, PunchSwing, PunchHit, Clap, Jump, Slam, Footstep }
        static readonly string[] Files={"transform","punch_swing","punch_hit","clap","jump","slam","footstep"};
        readonly AudioClip[] clips=new AudioClip[Files.Length];
        readonly int[] counts=new int[Files.Length];
        AudioSource source,roar;
        public Cue LastCue { get; private set; }
        public bool Ready { get; private set; }
        public int Count(Cue cue)=>counts[(int)cue];
        void Awake()
        {
            source=gameObject.AddComponent<AudioSource>();source.playOnAwake=false;source.spatialBlend=0;source.volume=.8f;
            roar=gameObject.AddComponent<AudioSource>();roar.playOnAwake=false;roar.spatialBlend=0;roar.volume=.85f;roar.priority=24;
            Ready=true;
            for(int i=0;i<Files.Length;i++)
            {clips[i]=Resources.Load<AudioClip>("HeroAudio/"+Files[i]);if(clips[i]==null){Ready=false;Debug.LogError("[Hulk audio] Missing "+Files[i]);}}
        }
        public void Play(Cue cue,float volume=1)
        {
            if(GameManager.Instance==null||!GameManager.Instance.IsPlaying||clips[(int)cue]==null)return;
            LastCue=cue;counts[(int)cue]++;
            if(cue==Cue.Transform){roar.Stop();roar.clip=clips[(int)cue];roar.volume=.85f*Mathf.Clamp01(volume);roar.Play();}
            else source.PlayOneShot(clips[(int)cue],volume);
        }
        public void Stop(){source.Stop();roar.Stop();}
    }
}
