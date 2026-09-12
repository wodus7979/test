using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;
namespace SniperRidge
{
    // Screen-space marker remains visible through buildings and points back onto the screen.
    public sealed class FlagObjectiveHud:MonoBehaviour
    {
        GameManager game; RectTransform canvas,marker,arrow,map,bossPanel,healthFill,armorFill;
        Text label,compass,mapTitle,bossText; AssaultMapGraphic graphic;
        readonly NavMeshPath route=new NavMeshPath(); float refresh;
        public static void Create(Transform parent,RectTransform canvas,GameManager game)
        {
            var root=new GameObject("King navigation",typeof(RectTransform));root.transform.SetParent(parent,false);
            var rect=root.GetComponent<RectTransform>();UiKit.Place(rect,Vector2.zero,Vector2.one,Vector2.one*.5f,Vector2.zero,Vector2.zero);
            var hud=root.AddComponent<FlagObjectiveHud>();hud.game=game;hud.canvas=canvas;hud.Build();
        }
        void Build()
        {
            var mid=Vector2.one*.5f;var gold=new Color(1,.79f,.28f);
            marker=UiKit.Panel(transform,"King marker",new Color(.025f,.035f,.04f,.82f),mid,mid,mid,Vector2.zero,new Vector2(176,64));
            var diamond=UiKit.Panel(marker,"Objective diamond",gold,mid,mid,mid,new Vector2(0,47),new Vector2(18,18));diamond.localRotation=Quaternion.Euler(0,0,45);
            label=UiKit.Label(marker,"King and distance","",20,TextAnchor.MiddleCenter,gold,mid,mid,Vector2.zero,new Vector2(170,60),true);
            arrow=UiKit.Panel(marker,"Offscreen direction",gold,mid,mid,mid,new Vector2(0,80),new Vector2(24,24));
            arrow.GetComponent<Image>().sprite=ProceduralAssets.SpriteFrom(ProceduralAssets.ArrowTexture(64));
            compass=UiKit.Label(transform,"Objective compass","",22,TextAnchor.UpperCenter,gold,new Vector2(.5f,1),new Vector2(.5f,1),new Vector2(0,-18),new Vector2(700,30),true);
            map=UiKit.Panel(transform,"Tactical map",new Color(.035f,.05f,.055f,.94f),new Vector2(0,1),new Vector2(0,1),new Vector2(0,1),new Vector2(30,-145),new Vector2(220,220));
            var surface=new GameObject("District plan",typeof(RectTransform));surface.transform.SetParent(map,false);
            UiKit.Place(surface.GetComponent<RectTransform>(),Vector2.zero,Vector2.one,mid,Vector2.zero,new Vector2(-12,-12));
            graphic=surface.AddComponent<AssaultMapGraphic>();graphic.Game=game;graphic.raycastTarget=false;
            mapTitle=UiKit.Label(map,"Map legend","N ↑   왕: 노랑 · 동료: 파랑",15,TextAnchor.UpperLeft,Color.white,new Vector2(0,0),new Vector2(0,1),new Vector2(0,-8),new Vector2(550,46));
            bossPanel=UiKit.Panel(transform,"King health",new Color(.03f,.035f,.045f,.9f),new Vector2(.5f,1),new Vector2(.5f,1),new Vector2(.5f,1),new Vector2(0,-56),new Vector2(480,86));
            bossText=UiKit.Label(bossPanel,"Boss status","",18,TextAnchor.UpperCenter,Color.white,new Vector2(.5f,1),new Vector2(.5f,1),new Vector2(0,-5),new Vector2(470,30),true);
            var hp=UiKit.Panel(bossPanel,"Health background",new Color(.2f,.07f,.07f),new Vector2(0,0),new Vector2(0,0),Vector2.zero,new Vector2(12,28),new Vector2(456,14));
            healthFill=UiKit.Panel(hp,"Health",new Color(.8f,.16f,.12f),Vector2.zero,Vector2.one,new Vector2(0,.5f),Vector2.zero,Vector2.zero);
            var armor=UiKit.Panel(bossPanel,"Armour background",new Color(.13f,.16f,.2f),Vector2.zero,Vector2.zero,Vector2.zero,new Vector2(12,9),new Vector2(456,12));
            armorFill=UiKit.Panel(armor,"Armour",new Color(.34f,.64f,.85f),Vector2.zero,Vector2.one,new Vector2(0,.5f),Vector2.zero,Vector2.zero);
        }
        void LateUpdate()
        {
            bool active=game.IsPlaying && game.Assault!=null && game.Player.IsFreeRoam;
            marker.gameObject.SetActive(active);map.gameObject.SetActive(active);compass.gameObject.SetActive(active);bossPanel.gameObject.SetActive(active&&game.Assault.King!=null&&game.Assault.King.Engaged);
            if(!active)return;
            var battle=game.Assault;var camera=game.PlayerEye.GetComponent<Camera>();
            var viewport=camera.WorldToViewportPoint(battle.Objective+Vector3.up*4.6f);
            var direction=camera.transform.InverseTransformDirection(battle.Objective-game.Player.transform.position);
            float bearing=Mathf.Atan2(direction.x,direction.z)*Mathf.Rad2Deg;
            bool outside=viewport.z<0 || viewport.x<.08f || viewport.x>.92f || viewport.y<.15f || viewport.y>.82f;
            Vector2 screen=new Vector2(viewport.x-.5f,viewport.y-.5f);
            if(viewport.z<0)screen=new Vector2(bearing<0?-.5f:.5f,.04f);
            marker.anchoredPosition=new Vector2(Mathf.Clamp(screen.x*canvas.rect.width,-canvas.rect.width*.5f+105,canvas.rect.width*.5f-105),
                Mathf.Clamp(screen.y*canvas.rect.height,-canvas.rect.height*.5f+220,canvas.rect.height*.5f-155));
            arrow.gameObject.SetActive(outside);
            arrow.localRotation=Quaternion.Euler(0,0,-Mathf.Atan2(screen.x,screen.y)*Mathf.Rad2Deg);
            label.text="왕 · 최종 목표\n"+Mathf.RoundToInt(battle.Distance)+" m";
            if(battle.King!=null)
            {
                var king=battle.King;
                healthFill.localScale=new Vector3(Mathf.Clamp01(king.Soldier.Health/KingBoss.MaximumHealth),1,1);
                armorFill.localScale=new Vector3(Mathf.Clamp01(king.Armor.Remaining/KingBoss.MaximumArmor),1,1);
                bossText.text="왕  ·  체력 "+Mathf.CeilToInt(king.Soldier.Health)+"  /  방어구 "+Mathf.CeilToInt(king.Armor.Remaining)+"\n"+king.Action;
                bossText.rectTransform.sizeDelta=new Vector2(470,50);bossText.fontSize=16;
            }
            float heading=camera.transform.eulerAngles.y;
            string cardinal=new[]{"N","NE","E","SE","S","SW","W","NW"}[Mathf.RoundToInt(heading/45)%8];
            compass.text=cardinal+"  "+Mathf.RoundToInt(heading).ToString("000")+"°     |     왕 "+
                (Mathf.Abs(bearing)<12?"정면":Mathf.Abs(bearing)>160?"뒤쪽":bearing<0?"← "+Mathf.RoundToInt(-bearing)+"°":Mathf.RoundToInt(bearing)+"° →");
            bool expanded=Input.GetKey(KeyCode.Tab);
            UiKit.Place(map,expanded?Vector2.one*.5f:new Vector2(0,1),expanded?Vector2.one*.5f:new Vector2(0,1),expanded?Vector2.one*.5f:new Vector2(0,1),
                expanded?Vector2.zero:new Vector2(30,-145),expanded?new Vector2(580,580):new Vector2(220,220));
            mapTitle.text=expanded?"N ↑   흰색: 나 · 파랑: 동료 · 노랑: 왕\n"+battle.ObjectiveName+" — 왕까지의 이동 경로 · Tab 놓기: 닫기":"N ↑   [Tab] 전술 지도";
            if(Time.time>=refresh)
            {
                refresh=Time.time+.7f;
                if(NavMesh.SamplePosition(game.Player.transform.position,out var start,3,NavMesh.AllAreas) &&
                    NavMesh.SamplePosition(battle.Objective,out var end,3,NavMesh.AllAreas) &&
                    NavMesh.CalculatePath(start.position,end.position,NavMesh.AllAreas,route) && route.status==NavMeshPathStatus.PathComplete)
                    graphic.Route=route.corners;
                else graphic.Route=null;
            }
            graphic.SetVerticesDirty();
        }
    }
    public sealed class AssaultMapGraphic:MaskableGraphic
    {
        public GameManager Game;public Vector3[] Route;
        Vector2 Map(Vector3 p)=>new Vector2(p.x,p.z)/AssaultLayout.Size*rectTransform.rect.size;
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();if(Game==null||Game.Assault==null)return;
            foreach(var building in AssaultLayout.Data.buildings)
            {
                Vector2 size=building.asset=="apartment_slab"||building.asset=="town_residential"?new Vector2(30,16):building.asset=="retail_row"||building.asset=="town_shops"?new Vector2(28,14):new Vector2(20,20);
                if(Mathf.Abs(Mathf.Sin(building.yaw*Mathf.Deg2Rad))>.5f)size=new Vector2(size.y,size.x);
                Rect(vh,Map(building.WorldPosition),size/AssaultLayout.Size*rectTransform.rect.size,new Color(.22f,.26f,.27f));
            }
            if(Route!=null)for(int i=1;i<Route.Length;i++)Line(vh,Map(Route[i-1]),Map(Route[i]),2,new Color(1,.78f,.28f,.85f));
            Rect(vh,Map(Game.Assault.Objective),Vector2.one*11,new Color(1,.75f,.2f));
            foreach(var soldier in Game.Assault.Soldiers)
                if(soldier!=null&&!soldier.IsDead&&soldier.IsAlly)Rect(vh,Map(soldier.transform.position),Vector2.one*4,new Color(.2f,.8f,1));
            var player=Map(Game.Player.transform.position);Rect(vh,player,Vector2.one*6,Color.white);
            Vector3 forward=Game.PlayerEye.forward;Line(vh,player,player+new Vector2(forward.x,forward.z).normalized*13,2,Color.white);
        }
        static void Rect(VertexHelper vh,Vector2 c,Vector2 size,Color color)
        {Vector2 h=size*.5f;Quad(vh,c+new Vector2(-h.x,-h.y),c+new Vector2(-h.x,h.y),c+h,c+new Vector2(h.x,-h.y),color);}
        static void Line(VertexHelper vh,Vector2 a,Vector2 b,float width,Color color)
        {Vector2 d=b-a;Vector2 n=new Vector2(-d.y,d.x).normalized*width*.5f;Quad(vh,a-n,a+n,b+n,b-n,color);}
        static void Quad(VertexHelper vh,Vector2 a,Vector2 b,Vector2 c,Vector2 d,Color color)
        {
            int i=vh.currentVertCount;vh.AddVert(a,color,Vector2.zero);vh.AddVert(b,color,Vector2.zero);vh.AddVert(c,color,Vector2.zero);vh.AddVert(d,color,Vector2.zero);
            vh.AddTriangle(i,i+1,i+2);vh.AddTriangle(i,i+2,i+3);
        }
    }
}
