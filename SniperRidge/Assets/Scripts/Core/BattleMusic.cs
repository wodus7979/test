using UnityEngine;

namespace SniperRidge
{
    /// <summary>Original phase-aligned score; weapon/attack cues take priority over music.</summary>
    public sealed class BattleMusic:MonoBehaviour
    {
        GameManager gm;
        AudioSource theme,rhythm;
        float duckUntil;
        bool muted;
        public void Initialize(GameManager game)
        {
            gm=game;muted=PlayerPrefs.GetInt("BattleMusicMuted",0)!=0;
            theme=Voice("bgm_ridge_theme");rhythm=Voice("bgm_ridge_battle");
            double start=AudioSettings.dspTime+1.0;
            if(theme.clip!=null)theme.PlayScheduled(start);
            if(rhythm.clip!=null)rhythm.PlayScheduled(start);
        }
        AudioSource Voice(string name)
        {
            var source=gameObject.AddComponent<AudioSource>();source.clip=Resources.Load<AudioClip>("Audio/"+name);
            source.loop=true;source.playOnAwake=false;source.spatialBlend=0;source.priority=200;source.volume=0;
            if(source.clip==null)Debug.LogWarning("[Sniper Ridge] BGM 누락: "+name);
            return source;
        }
        public void Duck(float seconds=.65f)
        {
            duckUntil=Mathf.Max(duckUntil,Time.unscaledTime+seconds);
            if(theme!=null)theme.volume=Mathf.Min(theme.volume,.052f);
            if(rhythm!=null)rhythm.volume=Mathf.Min(rhythm.volume,.030f);
        }
        void Update()
        {
            if(gm==null||theme==null)return;
            if(Input.GetKeyDown(KeyCode.M))
            {
                muted=!muted;PlayerPrefs.SetInt("BattleMusicMuted",muted?1:0);PlayerPrefs.Save();
                if(gm.Hud!=null && gm.IsPlaying)gm.Hud.Announce(muted?"BGM 끄기 · M으로 다시 켜기":"BGM 켜기 · M으로 끄기");
            }
            bool battle=gm.IsPlaying && (gm.AliveEnemies>0 || gm.Armor!=null && gm.Armor.AliveTanks>0);
            float level=muted?0:Time.unscaledTime<duckUntil?.2f:1;
            float themeTarget=level*(gm.IsPlaying?.26f:gm.IsSelecting?.13f:.06f);
            float rhythmTarget=level*(battle?.15f:0);
            float speed=muted?3f:.24f;
            theme.volume=Mathf.MoveTowards(theme.volume,themeTarget,Time.unscaledDeltaTime*speed);
            rhythm.volume=Mathf.MoveTowards(rhythm.volume,rhythmTarget,Time.unscaledDeltaTime*speed);
        }
    }
}
