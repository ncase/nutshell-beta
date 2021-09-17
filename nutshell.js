window.Nutshell = {};

Nutshell.rawHTML = {};
Nutshell.urlCredits = {};

// Starting Nutshell! Just adds itself..
Nutshell._topArticle;
Nutshell.start = ()=>{

    // Reset
    Nutshell.rawHTML = {};
    Nutshell.urlCredits = {};

    // Add itself as an article
    let selfHTML = document.body.parentNode.innerHTML;
    Nutshell.addArticleHTML(document.baseURI, selfHTML);

    // Replace all links
    Nutshell._topArticle = Nutshell._findArticleInDOM(document.body);
    Nutshell.turnLinksToNutshells(Nutshell._topArticle, document.baseURI);

    // TELL MY PARENT FRAME (IF ANY) MY *ARTICLE'S* RAW HTML (AND ONLY THAT)
    let rawHTML = Nutshell.rawHTML[document.baseURI];
    if(window.parent != window){
        window.parent.postMessage(rawHTML,'*');
    }


};

window.addEventListener('DOMContentLoaded', Nutshell.start);

// Adding an article - ONLY store the raw HTML:
// Give the URL it's associated with, and the raw HTML
// (if no URL given, we're adding THIS page)
// Then, try to find the <article>. If not there, assume FIRST element with a child <p> is it.
// (why first element? to ignore comments section.)

Nutshell.addArticleHTML = (url, html)=>{

    // SANITIZE RAW HTML
    html = DOMPurify.sanitize(html, {
        FORBID_TAGS: ['style'],
        FORBID_ATTR: ['style'],
        ADD_TAGS: ['iframe']
    });

    // Every iframe is sandboxed
    html = html.replaceAll(/iframe/ig, 'iframe sandbox="allow-scripts"');

    // Replace all src='', src="", href='', href="" with ABSOLUTE links.
    const regex = RegExp('(src|href)\=(\'|\")([^(\'|\")]*)(\'|\")', 'ig');
    let result;
    while ((result = regex.exec(html)) !== null) {

        let [full,tag,quote,link] = result;

        // If it starts with // or has :// in it it's already absolute, skip
        if(link.indexOf("//")==0 || link.indexOf("://")>0) continue;

        // If not, CONVERT TO ABSOLUTE!
        let absolute = new URL(link, url).href;
        html = Nutshell._replaceStringBetween(
            html, result.index, full.length,
            tag+'='+quote+absolute+quote
        );

    }

    return new Promise( (resolve, reject)=>{

        // If already added, just give it again.
        if(Nutshell.rawHTML[url]) resolve(Nutshell.rawHTML[url]);

        // For searching & manipulation within...
        let doc = document.createElement("span");
        doc.innerHTML = html;

        // Find the article in it
        let article = Nutshell._findArticleInDOM(doc);

        // Get the title of the page & remember it in the credits
        let title = doc.querySelector("title");
        title = title ? title.innerText : url;
        Nutshell.urlCredits[url] = title;

        // Remember it!
        resolve( Nutshell.rawHTML[url] = article.innerHTML );

    });

};

// Getting an article's raw HTML: try the cache,
// if not, fetch new HTML and add it! Then resolve with article's HTML.

Nutshell.getArticleHTML = (url)=>{
    return new Promise( (resolve, reject)=>{

        // Already in cache? Good.
        let articleHTML = Nutshell.rawHTML[url];
        if(articleHTML) return resolve(articleHTML);

        // If not, try fetching HTML directly
        fetch(url).then(response=>response.text()).then(html=>{
            Nutshell.addArticleHTML(url,html).then(resolve);
        }).catch((e)=>{

            console.warn("The above CORS failure is expected! Don't worry about it!");

            // If that fails, iframe it & postMessage
            let _resolved = false;
            Nutshell._whenReceiveMessageHTML = (html)=>{
                _resolved = true;
                Nutshell.addArticleHTML(url,html).then(resolve);
                if(Nutshell._testIframe){
                    document.body.removeChild(Nutshell._testIframe);
                    Nutshell._testIframe = null;
                }
            };
            Nutshell._testIframe = document.createElement('iframe');
            Nutshell._testIframe.sandbox = 'allow-scripts';
            Nutshell._testIframe.src = url;
            Nutshell._testIframe.style.display = 'none';
            document.body.appendChild(Nutshell._testIframe);

            // Otherwise reject in five seconds
            setTimeout(()=>{
                if(!_resolved){
                    Nutshell._whenReceiveMessageHTML = null;
                    reject();
                }
            },5000);

        });

    });
};

// Receiving messages from child frames: JUST that article's HTML
Nutshell._testIframe = null;
Nutshell._whenReceiveMessageHTML = null;
window.addEventListener('message', (e)=>{
    if(Nutshell._whenReceiveMessageHTML){
        Nutshell._whenReceiveMessageHTML(e.data);
    }
}, false);

// Replace all :links with a classier-lookin' button (that calls Nutshell)
// Also modify the text nodes right after, so punctuation isn't cut.

Nutshell.turnLinksToNutshells = (el, baseURL, makeAllBlank)=>{

    let links = [...el.querySelectorAll("a")];
    links.forEach((a)=>{

        // No matter what, all links in a bubble should open in new setAttribute
        if(makeAllBlank) a.target = '_blank';

        // Don't bother if not a :nutshell
        if(a.innerText.trim()[0]!=":") return;

        // Replace looks
        a.innerText = a.innerText.trim().slice(1).trim(); // remove the : & whitespace before/after
        a.classList.add('nutshell-button');

        // Split the punctuation & text...
        let continueHTML = null;
        let beforeBreak = document.createTextNode('');
        let continueSpan = document.createElement('span');
        continueSpan.className = 'nutshell-continue';
        let afterBreak = document.createTextNode('');
        if(a.nextSibling && a.nextSibling.nodeType == Node.TEXT_NODE){

            let textContent = a.nextSibling.textContent;
            let punct = textContent.match(/[^\s]*/)[0]; // the punctuation before next spaces
            beforeBreak.textContent = punct+" ";
            afterBreak.textContent = textContent.slice(punct.length+1).trim()+" "; // Stuff afterwards

            // For continuing text
            if(afterBreak.textContent.length>2){ // yes if more than 2 chars after
                let prevText = (a.previousSibling && a.previousSibling.nodeType == Node.TEXT_NODE) ? a.previousSibling.textContent : '';
                let prevTextSplit = prevText.split(/[\.\!\?]/);
                let prevSentence = prevTextSplit[prevTextSplit.length-1];
                //continueHTML = '...'+prevSentence.trim()+' <strong>'+a.textContent+'</strong> ';
                continueHTML = prevSentence.trim()+' <strong>'+a.textContent+'</strong>'+punct+' ';
            }

            a.nextSibling.parentNode.removeChild(a.nextSibling); // REMOVE THE ORIGINAL TEXTNODE

        }

        // Expanded nutshell
        let expanded = document.createElement("span");
        expanded.className = "nutshell-expanded";
        expanded.style.display = 'none';

        // PUT BACK IN: before / EXPAND / continueSpan / after
        a.after(beforeBreak);
        beforeBreak.after(expanded);
        expanded.after(continueSpan);
        continueSpan.after(afterBreak);

        // Bubble
        let bubble = document.createElement("div");
        bubble.className = "nutshell-bubble";
        expanded.appendChild(bubble);
        // Bubble's arrow
        let bubbleArrowBlack = document.createElement("div");
        bubbleArrowBlack.className = "nutshell-arrow-black";
        bubble.appendChild(bubbleArrowBlack);
        let bubbleArrowWhite = document.createElement("div");
        bubbleArrowWhite.className = "nutshell-arrow-white";
        bubble.appendChild(bubbleArrowWhite);
        // Bubble's content
        let bubbleContent = document.createElement("div");
        bubbleContent.className = "nutshell-content";
        bubbleContent.setAttribute("animating","no");
        bubble.appendChild(bubbleContent);
        // Close bubble
        let closeBubble = document.createElement("div");
        closeBubble.className = "nutshell-close";
        closeBubble.innerHTML = "✕";
        bubble.appendChild(closeBubble);

        // Get fontsize in px...
        let fontsize = parseFloat(getComputedStyle(Nutshell._topArticle).fontSize);

        // Toggle open/close Nutshell!
        let _IS_EXPANDED = false;
        let _onToggleNutshell = ()=>{
            if(_IS_EXPANDED){

                // SHRINK
                let bounds = bubbleContent.getBoundingClientRect();
                bubbleContent.style.height = Math.round(bounds.height) + "px";
                bubbleContent.setAttribute("animating","close");
                setTimeout(()=>{
                    bubbleContent.style.height = '0px';
                    setTimeout(()=>{
                        expanded.style.display = 'none';
                        continueSpan.textContent = '';
                        bubbleContent.innerHTML = '';
                    },300);
                },10);

                // ScrollTo if outta bounds!
                if(bounds.top<0){
                    window.scrollTo({
                        top: window.scrollY + bounds.top - fontsize*3,
                        behavior: 'smooth'
                    });
                }

            }else{

                // SHOW
                expanded.style.display = 'block';
                if(continueHTML) continueSpan.innerHTML = continueHTML;

                // Position the arrow
                let bubbleX = bubble.getBoundingClientRect().x,
                    buttonX = a.getBoundingClientRect().x + a.getBoundingClientRect().width/2,
                    arrowX = buttonX - bubbleX;
                bubbleArrowBlack.style.left = Math.round(arrowX) + "px";
                bubbleArrowWhite.style.left = Math.round(arrowX) + "px";

                // EXPAND
                bubbleContent.setAttribute("animating","no");
                bubbleContent.style.height = 0;
                setTimeout(()=>{

                    // "Loading"...
                    bubbleContent.setAttribute("animating","open");
                    bubbleContent.style.height = Math.round(3 * fontsize) + "px";
                    bubbleContent.innerHTML = "<span><p>⏳</p></span>"; // loading...

                    // When loaded...
                    Nutshell.get(a.href).then((nut)=>{
                        bubbleContent.innerHTML = '';
                        bubbleContent.appendChild(nut);
                        bubbleContent.style.height = Math.round( nut.getBoundingClientRect().height + 2*fontsize ) + "px";

                        // Then back to not animating!
                        setTimeout(()=>{
                            bubbleContent.setAttribute("animating","no");
                            bubbleContent.style.height = 'auto';
                        },500);

                    });

                },1);

            }
            _IS_EXPANDED = !_IS_EXPANDED;

        };

        // The link itself, and the close button.
        a.addEventListener('click', (e)=>{
            e.preventDefault();
            _onToggleNutshell();
        }, false);
        closeBubble.addEventListener('click', _onToggleNutshell, false);

    });

};

// When asking for a Nutshell...
// 1) Get the article, by url
// 2) Get the first header that matches the query
// 3) Grab all text until the next section, or end of article

Nutshell.get = (url_plus_query)=>{

    return new Promise((resolve, reject)=>{

        // Which article?
        let [url, query] = url_plus_query.split("#");
        Nutshell.getArticleHTML(url).then((articleHTML)=>{

            // For searching within...
            let span = document.createElement('span');
            span.innerHTML = articleHTML;

            // Get all headers in the article
            let allHeaders = Nutshell._HEADER_NAMES.reduce((accumulated, currentTagName)=>{
                return accumulated.concat([...span.querySelectorAll(currentTagName)]);
            },[]);

            // Find first header that matches
            let header = allHeaders.find((header)=>{
                return Nutshell._doesHeaderMatchQuery(header,query);
            });
            if(!header){
                // No header match? Oh no.
                let nope = document.createElement('span');
                nope.innerHTML = `<p>(Can't find section named “${query}” in ${url}!)</p>`;
                resolve(nope);
                return;
            }

            // Keep adding paragraphs until next header, or end of article.
            let result = document.createElement("span");
            let el = header.nextElementSibling;
            while(el && !Nutshell._isThisAHeader(el)){
                result.appendChild(el);
                el = header.nextElementSibling; // not el's nextsibling, coz appending to 'result' removes from 'span'
            }

            // Recursively replace Nutshells
            Nutshell.turnLinksToNutshells(result, url, true);

            // Add credits if not from THIS url.
            if(url != document.baseURI){
                let credit = document.createElement("div");
                credit.className = "nutshell-credit";
                credit.innerHTML = `🔗 from <a target='_blank' href='${url}'>${Nutshell.urlCredits[url]}</a>`;
                result.prepend(credit);
                // TODO: some anim glitch, whatever
            }

            // Gimme!
            resolve(result);

        }).catch(()=>{

            // Nope
            // TODO: GIVE LINK
            let nope = document.createElement('span');
            nope.innerHTML = "<p>(Sorry, this explanation can't be loaded from its external website! Maybe it's down, or doesn't allow other websites to embed parts of it.)</p>";
            resolve(nope);

        });

    });

};

// Helper functions

Nutshell._HEADER_NAMES = ['H1','H2','H3','H4','H5','H6','HR'];
Nutshell._isThisAHeader = (el)=>{
    return Nutshell._HEADER_NAMES.indexOf(el.tagName)>=0;
};
Nutshell._doesHeaderMatchQuery = (header, query)=>{
    header = Nutshell._strip(header.innerText);
    query = Nutshell._strip(query.replace(/%20/g,' '));
    return header==query; // it's the same.
};
Nutshell._strip = (text)=>text.toLowerCase().replace(/[^\w]/gi,'').replace('_',''); // lowercase, no punctuation or spaces
Nutshell._findArticleInDOM = (el)=>{
    let article, p;
    if(article = el.querySelector("article")) return article;
    if(p = el.querySelector("p")) return el.querySelector("p").parentNode;
    alert("OK HI WHATEVER YOU'RE TRYING TO INCLUDE DOESN'T HAVE <article> OR <p> TAGS IN IT, THAT'S REALLY WEIRD.");
};
Nutshell._replaceStringBetween = function(str, i, len, insert) {
    return str.substring(0,i) + insert + str.substring(i+len);
};


/**************************************************************************/
/**************************************************************************/
/**************************************************************************/

// Nutshell Style
{
    let style = document.createElement("style");
    style.innerHTML = `
    .nutshell-button{
        border:1px solid black;
        border-radius:1em;
        color: inherit;
        text-decoration: none;
        padding: 0 0.3em;
        display: inline-block;
        transition: all 0.1s;
        opacity: 1;
        position: relative;
        top:0;
    }
    .nutshell-button:hover{
        opacity: 0.6;
        transform: scale(1.04, 1.04);
        /*top:-2px;*/
    }
    .nutshell-button:active{
        opacity: 1;
        transform: scale(0.97, 0.97);
        /*top:1px;*/
    }
    .nutshell-bubble{
        position: relative;
        border: 1px solid black;
        border-radius:1em;
        /*padding: 0 1em;*/
        margin: 2px;
        margin-top: 17px;
    }
    .nutshell-bubble > span > *{
        margin-left: 1em;
        margin-right: 1em;
    }
    .nutshell-bubble .nutshell-bubble{
        width: calc(100% + 2em - 6px);
        position: relative;
        left: -1em;
    }
    .nutshell-content{
        overflow:hidden;
        font-weight:normal;
        font-style:normal;
        padding-bottom: 0.5em;
    }
    .nutshell-content[animating=no]{
        height:auto;
        transition: none;
    }
    .nutshell-content[animating=open]{
        transition: height 0.3s ease-out;
    }
    .nutshell-content[animating=close]{
        transition: height 0.3s ease-in;
    }

    .nutshell-content img{
        max-width: 100%;
        border: 1px solid #ddd;
    }
    .nutshell-content iframe{
        border: 1px solid #ddd;
        display:block;
    }

    .nutshell-bubble > .nutshell-content > span > *{
        margin-left: 1em;
        margin-right: 1em;
    }
    .nutshell-bubble > .nutshell-content > span .nutshell-content{
        margin:0;
    }

    .nutshell-bubble .nutshell-arrow-black, .nutshell-bubble .nutshell-arrow-white{
        bottom: 100%;
        left: 0px;
        border: solid transparent;
        height: 0;
        width: 0;
        position: absolute;
    }
    .nutshell-bubble .nutshell-arrow-white {
        border-color: rgba(0,0,0,0);
        border-bottom-color: #FFF;
        border-width: 10px;
        margin-left: -10px;
    }
    .nutshell-bubble .nutshell-arrow-black {
        border-color: rgba(0,0,0,0);
        border-bottom-color: #000;
        border-width: 11px;
        margin-left: -11px;
    }
    .nutshell-bubble .nutshell-close{

        cursor: pointer;

        position: absolute;
        width:100%;
        right: 0;
        bottom: 0;
        text-align:center;

        font-size: 0.8em;
        line-height: 2em;
        font-weight: 100;

        opacity: 0.33;
        transition: opacity 0.2s;

    }
    .nutshell-bubble .nutshell-close:hover{
        opacity: 1;
    }

    .nutshell-credit{
        display: block;
        font-size: 0.8em;
        opacity: 0.5;
        position: relative;
        left: 0.31em;
        top: 0.8em;
        margin-bottom: 1.5em;
    }

    .nutshell-continue{
        opacity:0.33;
    }
    `;
    document.head.appendChild(style);
}


/*! @license DOMPurify 2.3.1 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/2.3.1/LICENSE */
!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?module.exports=t():"function"==typeof define&&define.amd?define(t):(e=e||self).DOMPurify=t()}(this,(function(){"use strict";var e=Object.hasOwnProperty,t=Object.setPrototypeOf,n=Object.isFrozen,r=Object.getPrototypeOf,o=Object.getOwnPropertyDescriptor,i=Object.freeze,a=Object.seal,l=Object.create,c="undefined"!=typeof Reflect&&Reflect,s=c.apply,u=c.construct;s||(s=function(e,t,n){return e.apply(t,n)}),i||(i=function(e){return e}),a||(a=function(e){return e}),u||(u=function(e,t){return new(Function.prototype.bind.apply(e,[null].concat(function(e){if(Array.isArray(e)){for(var t=0,n=Array(e.length);t<e.length;t++)n[t]=e[t];return n}return Array.from(e)}(t))))});var f,m=x(Array.prototype.forEach),d=x(Array.prototype.pop),p=x(Array.prototype.push),g=x(String.prototype.toLowerCase),h=x(String.prototype.match),y=x(String.prototype.replace),v=x(String.prototype.indexOf),b=x(String.prototype.trim),T=x(RegExp.prototype.test),A=(f=TypeError,function(){for(var e=arguments.length,t=Array(e),n=0;n<e;n++)t[n]=arguments[n];return u(f,t)});function x(e){return function(t){for(var n=arguments.length,r=Array(n>1?n-1:0),o=1;o<n;o++)r[o-1]=arguments[o];return s(e,t,r)}}function S(e,r){t&&t(e,null);for(var o=r.length;o--;){var i=r[o];if("string"==typeof i){var a=g(i);a!==i&&(n(r)||(r[o]=a),i=a)}e[i]=!0}return e}function w(t){var n=l(null),r=void 0;for(r in t)s(e,t,[r])&&(n[r]=t[r]);return n}function N(e,t){for(;null!==e;){var n=o(e,t);if(n){if(n.get)return x(n.get);if("function"==typeof n.value)return x(n.value)}e=r(e)}return function(e){return console.warn("fallback value for",e),null}}var k=i(["a","abbr","acronym","address","area","article","aside","audio","b","bdi","bdo","big","blink","blockquote","body","br","button","canvas","caption","center","cite","code","col","colgroup","content","data","datalist","dd","decorator","del","details","dfn","dialog","dir","div","dl","dt","element","em","fieldset","figcaption","figure","font","footer","form","h1","h2","h3","h4","h5","h6","head","header","hgroup","hr","html","i","img","input","ins","kbd","label","legend","li","main","map","mark","marquee","menu","menuitem","meter","nav","nobr","ol","optgroup","option","output","p","picture","pre","progress","q","rp","rt","ruby","s","samp","section","select","shadow","small","source","spacer","span","strike","strong","style","sub","summary","sup","table","tbody","td","template","textarea","tfoot","th","thead","time","tr","track","tt","u","ul","var","video","wbr"]),E=i(["svg","a","altglyph","altglyphdef","altglyphitem","animatecolor","animatemotion","animatetransform","circle","clippath","defs","desc","ellipse","filter","font","g","glyph","glyphref","hkern","image","line","lineargradient","marker","mask","metadata","mpath","path","pattern","polygon","polyline","radialgradient","rect","stop","style","switch","symbol","text","textpath","title","tref","tspan","view","vkern"]),D=i(["feBlend","feColorMatrix","feComponentTransfer","feComposite","feConvolveMatrix","feDiffuseLighting","feDisplacementMap","feDistantLight","feFlood","feFuncA","feFuncB","feFuncG","feFuncR","feGaussianBlur","feMerge","feMergeNode","feMorphology","feOffset","fePointLight","feSpecularLighting","feSpotLight","feTile","feTurbulence"]),O=i(["animate","color-profile","cursor","discard","fedropshadow","feimage","font-face","font-face-format","font-face-name","font-face-src","font-face-uri","foreignobject","hatch","hatchpath","mesh","meshgradient","meshpatch","meshrow","missing-glyph","script","set","solidcolor","unknown","use"]),R=i(["math","menclose","merror","mfenced","mfrac","mglyph","mi","mlabeledtr","mmultiscripts","mn","mo","mover","mpadded","mphantom","mroot","mrow","ms","mspace","msqrt","mstyle","msub","msup","msubsup","mtable","mtd","mtext","mtr","munder","munderover"]),_=i(["maction","maligngroup","malignmark","mlongdiv","mscarries","mscarry","msgroup","mstack","msline","msrow","semantics","annotation","annotation-xml","mprescripts","none"]),M=i(["#text"]),L=i(["accept","action","align","alt","autocapitalize","autocomplete","autopictureinpicture","autoplay","background","bgcolor","border","capture","cellpadding","cellspacing","checked","cite","class","clear","color","cols","colspan","controls","controlslist","coords","crossorigin","datetime","decoding","default","dir","disabled","disablepictureinpicture","disableremoteplayback","download","draggable","enctype","enterkeyhint","face","for","headers","height","hidden","high","href","hreflang","id","inputmode","integrity","ismap","kind","label","lang","list","loading","loop","low","max","maxlength","media","method","min","minlength","multiple","muted","name","noshade","novalidate","nowrap","open","optimum","pattern","placeholder","playsinline","poster","preload","pubdate","radiogroup","readonly","rel","required","rev","reversed","role","rows","rowspan","spellcheck","scope","selected","shape","size","sizes","span","srclang","start","src","srcset","step","style","summary","tabindex","title","translate","type","usemap","valign","value","width","xmlns","slot"]),F=i(["accent-height","accumulate","additive","alignment-baseline","ascent","attributename","attributetype","azimuth","basefrequency","baseline-shift","begin","bias","by","class","clip","clippathunits","clip-path","clip-rule","color","color-interpolation","color-interpolation-filters","color-profile","color-rendering","cx","cy","d","dx","dy","diffuseconstant","direction","display","divisor","dur","edgemode","elevation","end","fill","fill-opacity","fill-rule","filter","filterunits","flood-color","flood-opacity","font-family","font-size","font-size-adjust","font-stretch","font-style","font-variant","font-weight","fx","fy","g1","g2","glyph-name","glyphref","gradientunits","gradienttransform","height","href","id","image-rendering","in","in2","k","k1","k2","k3","k4","kerning","keypoints","keysplines","keytimes","lang","lengthadjust","letter-spacing","kernelmatrix","kernelunitlength","lighting-color","local","marker-end","marker-mid","marker-start","markerheight","markerunits","markerwidth","maskcontentunits","maskunits","max","mask","media","method","mode","min","name","numoctaves","offset","operator","opacity","order","orient","orientation","origin","overflow","paint-order","path","pathlength","patterncontentunits","patterntransform","patternunits","points","preservealpha","preserveaspectratio","primitiveunits","r","rx","ry","radius","refx","refy","repeatcount","repeatdur","restart","result","rotate","scale","seed","shape-rendering","specularconstant","specularexponent","spreadmethod","startoffset","stddeviation","stitchtiles","stop-color","stop-opacity","stroke-dasharray","stroke-dashoffset","stroke-linecap","stroke-linejoin","stroke-miterlimit","stroke-opacity","stroke","stroke-width","style","surfacescale","systemlanguage","tabindex","targetx","targety","transform","text-anchor","text-decoration","text-rendering","textlength","type","u1","u2","unicode","values","viewbox","visibility","version","vert-adv-y","vert-origin-x","vert-origin-y","width","word-spacing","wrap","writing-mode","xchannelselector","ychannelselector","x","x1","x2","xmlns","y","y1","y2","z","zoomandpan"]),I=i(["accent","accentunder","align","bevelled","close","columnsalign","columnlines","columnspan","denomalign","depth","dir","display","displaystyle","encoding","fence","frame","height","href","id","largeop","length","linethickness","lspace","lquote","mathbackground","mathcolor","mathsize","mathvariant","maxsize","minsize","movablelimits","notation","numalign","open","rowalign","rowlines","rowspacing","rowspan","rspace","rquote","scriptlevel","scriptminsize","scriptsizemultiplier","selection","separator","separators","stretchy","subscriptshift","supscriptshift","symmetric","voffset","width","xmlns"]),C=i(["xlink:href","xml:id","xlink:title","xml:space","xmlns:xlink"]),z=a(/\{\{[\s\S]*|[\s\S]*\}\}/gm),H=a(/<%[\s\S]*|[\s\S]*%>/gm),U=a(/^data-[\-\w.\u00B7-\uFFFF]/),j=a(/^aria-[\-\w]+$/),B=a(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i),P=a(/^(?:\w+script|data):/i),W=a(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g),G="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e};function q(e){if(Array.isArray(e)){for(var t=0,n=Array(e.length);t<e.length;t++)n[t]=e[t];return n}return Array.from(e)}var K=function(){return"undefined"==typeof window?null:window},V=function(e,t){if("object"!==(void 0===e?"undefined":G(e))||"function"!=typeof e.createPolicy)return null;var n=null,r="data-tt-policy-suffix";t.currentScript&&t.currentScript.hasAttribute(r)&&(n=t.currentScript.getAttribute(r));var o="dompurify"+(n?"#"+n:"");try{return e.createPolicy(o,{createHTML:function(e){return e}})}catch(e){return console.warn("TrustedTypes policy "+o+" could not be created."),null}};return function e(){var t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:K(),n=function(t){return e(t)};if(n.version="2.3.1",n.removed=[],!t||!t.document||9!==t.document.nodeType)return n.isSupported=!1,n;var r=t.document,o=t.document,a=t.DocumentFragment,l=t.HTMLTemplateElement,c=t.Node,s=t.Element,u=t.NodeFilter,f=t.NamedNodeMap,x=void 0===f?t.NamedNodeMap||t.MozNamedAttrMap:f,Y=t.Text,X=t.Comment,$=t.DOMParser,Z=t.trustedTypes,J=s.prototype,Q=N(J,"cloneNode"),ee=N(J,"nextSibling"),te=N(J,"childNodes"),ne=N(J,"parentNode");if("function"==typeof l){var re=o.createElement("template");re.content&&re.content.ownerDocument&&(o=re.content.ownerDocument)}var oe=V(Z,r),ie=oe&&ze?oe.createHTML(""):"",ae=o,le=ae.implementation,ce=ae.createNodeIterator,se=ae.createDocumentFragment,ue=ae.getElementsByTagName,fe=r.importNode,me={};try{me=w(o).documentMode?o.documentMode:{}}catch(e){}var de={};n.isSupported="function"==typeof ne&&le&&void 0!==le.createHTMLDocument&&9!==me;var pe=z,ge=H,he=U,ye=j,ve=P,be=W,Te=B,Ae=null,xe=S({},[].concat(q(k),q(E),q(D),q(R),q(M))),Se=null,we=S({},[].concat(q(L),q(F),q(I),q(C))),Ne=null,ke=null,Ee=!0,De=!0,Oe=!1,Re=!1,_e=!1,Me=!1,Le=!1,Fe=!1,Ie=!1,Ce=!0,ze=!1,He=!0,Ue=!0,je=!1,Be={},Pe=null,We=S({},["annotation-xml","audio","colgroup","desc","foreignobject","head","iframe","math","mi","mn","mo","ms","mtext","noembed","noframes","noscript","plaintext","script","style","svg","template","thead","title","video","xmp"]),Ge=null,qe=S({},["audio","video","img","source","image","track"]),Ke=null,Ve=S({},["alt","class","for","id","label","name","pattern","placeholder","role","summary","title","value","style","xmlns"]),Ye="http://www.w3.org/1998/Math/MathML",Xe="http://www.w3.org/2000/svg",$e="http://www.w3.org/1999/xhtml",Ze=$e,Je=!1,Qe=null,et=o.createElement("form"),tt=function(e){Qe&&Qe===e||(e&&"object"===(void 0===e?"undefined":G(e))||(e={}),e=w(e),Ae="ALLOWED_TAGS"in e?S({},e.ALLOWED_TAGS):xe,Se="ALLOWED_ATTR"in e?S({},e.ALLOWED_ATTR):we,Ke="ADD_URI_SAFE_ATTR"in e?S(w(Ve),e.ADD_URI_SAFE_ATTR):Ve,Ge="ADD_DATA_URI_TAGS"in e?S(w(qe),e.ADD_DATA_URI_TAGS):qe,Pe="FORBID_CONTENTS"in e?S({},e.FORBID_CONTENTS):We,Ne="FORBID_TAGS"in e?S({},e.FORBID_TAGS):{},ke="FORBID_ATTR"in e?S({},e.FORBID_ATTR):{},Be="USE_PROFILES"in e&&e.USE_PROFILES,Ee=!1!==e.ALLOW_ARIA_ATTR,De=!1!==e.ALLOW_DATA_ATTR,Oe=e.ALLOW_UNKNOWN_PROTOCOLS||!1,Re=e.SAFE_FOR_TEMPLATES||!1,_e=e.WHOLE_DOCUMENT||!1,Fe=e.RETURN_DOM||!1,Ie=e.RETURN_DOM_FRAGMENT||!1,Ce=!1!==e.RETURN_DOM_IMPORT,ze=e.RETURN_TRUSTED_TYPE||!1,Le=e.FORCE_BODY||!1,He=!1!==e.SANITIZE_DOM,Ue=!1!==e.KEEP_CONTENT,je=e.IN_PLACE||!1,Te=e.ALLOWED_URI_REGEXP||Te,Ze=e.NAMESPACE||$e,Re&&(De=!1),Ie&&(Fe=!0),Be&&(Ae=S({},[].concat(q(M))),Se=[],!0===Be.html&&(S(Ae,k),S(Se,L)),!0===Be.svg&&(S(Ae,E),S(Se,F),S(Se,C)),!0===Be.svgFilters&&(S(Ae,D),S(Se,F),S(Se,C)),!0===Be.mathMl&&(S(Ae,R),S(Se,I),S(Se,C))),e.ADD_TAGS&&(Ae===xe&&(Ae=w(Ae)),S(Ae,e.ADD_TAGS)),e.ADD_ATTR&&(Se===we&&(Se=w(Se)),S(Se,e.ADD_ATTR)),e.ADD_URI_SAFE_ATTR&&S(Ke,e.ADD_URI_SAFE_ATTR),e.FORBID_CONTENTS&&(Pe===We&&(Pe=w(Pe)),S(Pe,e.FORBID_CONTENTS)),Ue&&(Ae["#text"]=!0),_e&&S(Ae,["html","head","body"]),Ae.table&&(S(Ae,["tbody"]),delete Ne.tbody),i&&i(e),Qe=e)},nt=S({},["mi","mo","mn","ms","mtext"]),rt=S({},["foreignobject","desc","title","annotation-xml"]),ot=S({},E);S(ot,D),S(ot,O);var it=S({},R);S(it,_);var at=function(e){var t=ne(e);t&&t.tagName||(t={namespaceURI:$e,tagName:"template"});var n=g(e.tagName),r=g(t.tagName);if(e.namespaceURI===Xe)return t.namespaceURI===$e?"svg"===n:t.namespaceURI===Ye?"svg"===n&&("annotation-xml"===r||nt[r]):Boolean(ot[n]);if(e.namespaceURI===Ye)return t.namespaceURI===$e?"math"===n:t.namespaceURI===Xe?"math"===n&&rt[r]:Boolean(it[n]);if(e.namespaceURI===$e){if(t.namespaceURI===Xe&&!rt[r])return!1;if(t.namespaceURI===Ye&&!nt[r])return!1;var o=S({},["title","style","font","a","script"]);return!it[n]&&(o[n]||!ot[n])}return!1},lt=function(e){p(n.removed,{element:e});try{e.parentNode.removeChild(e)}catch(t){try{e.outerHTML=ie}catch(t){e.remove()}}},ct=function(e,t){try{p(n.removed,{attribute:t.getAttributeNode(e),from:t})}catch(e){p(n.removed,{attribute:null,from:t})}if(t.removeAttribute(e),"is"===e&&!Se[e])if(Fe||Ie)try{lt(t)}catch(e){}else try{t.setAttribute(e,"")}catch(e){}},st=function(e){var t=void 0,n=void 0;if(Le)e="<remove></remove>"+e;else{var r=h(e,/^[\r\n\t ]+/);n=r&&r[0]}var i=oe?oe.createHTML(e):e;if(Ze===$e)try{t=(new $).parseFromString(i,"text/html")}catch(e){}if(!t||!t.documentElement){t=le.createDocument(Ze,"template",null);try{t.documentElement.innerHTML=Je?"":i}catch(e){}}var a=t.body||t.documentElement;return e&&n&&a.insertBefore(o.createTextNode(n),a.childNodes[0]||null),Ze===$e?ue.call(t,_e?"html":"body")[0]:_e?t.documentElement:a},ut=function(e){return ce.call(e.ownerDocument||e,e,u.SHOW_ELEMENT|u.SHOW_COMMENT|u.SHOW_TEXT,null,!1)},ft=function(e){return!(e instanceof Y||e instanceof X)&&!("string"==typeof e.nodeName&&"string"==typeof e.textContent&&"function"==typeof e.removeChild&&e.attributes instanceof x&&"function"==typeof e.removeAttribute&&"function"==typeof e.setAttribute&&"string"==typeof e.namespaceURI&&"function"==typeof e.insertBefore)},mt=function(e){return"object"===(void 0===c?"undefined":G(c))?e instanceof c:e&&"object"===(void 0===e?"undefined":G(e))&&"number"==typeof e.nodeType&&"string"==typeof e.nodeName},dt=function(e,t,r){de[e]&&m(de[e],(function(e){e.call(n,t,r,Qe)}))},pt=function(e){var t=void 0;if(dt("beforeSanitizeElements",e,null),ft(e))return lt(e),!0;if(h(e.nodeName,/[\u0080-\uFFFF]/))return lt(e),!0;var r=g(e.nodeName);if(dt("uponSanitizeElement",e,{tagName:r,allowedTags:Ae}),!mt(e.firstElementChild)&&(!mt(e.content)||!mt(e.content.firstElementChild))&&T(/<[/\w]/g,e.innerHTML)&&T(/<[/\w]/g,e.textContent))return lt(e),!0;if("select"===r&&T(/<template/i,e.innerHTML))return lt(e),!0;if(!Ae[r]||Ne[r]){if(Ue&&!Pe[r]){var o=ne(e)||e.parentNode,i=te(e)||e.childNodes;if(i&&o)for(var a=i.length-1;a>=0;--a)o.insertBefore(Q(i[a],!0),ee(e))}return lt(e),!0}return e instanceof s&&!at(e)?(lt(e),!0):"noscript"!==r&&"noembed"!==r||!T(/<\/no(script|embed)/i,e.innerHTML)?(Re&&3===e.nodeType&&(t=e.textContent,t=y(t,pe," "),t=y(t,ge," "),e.textContent!==t&&(p(n.removed,{element:e.cloneNode()}),e.textContent=t)),dt("afterSanitizeElements",e,null),!1):(lt(e),!0)},gt=function(e,t,n){if(He&&("id"===t||"name"===t)&&(n in o||n in et))return!1;if(De&&!ke[t]&&T(he,t));else if(Ee&&T(ye,t));else{if(!Se[t]||ke[t])return!1;if(Ke[t]);else if(T(Te,y(n,be,"")));else if("src"!==t&&"xlink:href"!==t&&"href"!==t||"script"===e||0!==v(n,"data:")||!Ge[e]){if(Oe&&!T(ve,y(n,be,"")));else if(n)return!1}else;}return!0},ht=function(e){var t=void 0,r=void 0,o=void 0,i=void 0;dt("beforeSanitizeAttributes",e,null);var a=e.attributes;if(a){var l={attrName:"",attrValue:"",keepAttr:!0,allowedAttributes:Se};for(i=a.length;i--;){var c=t=a[i],s=c.name,u=c.namespaceURI;if(r=b(t.value),o=g(s),l.attrName=o,l.attrValue=r,l.keepAttr=!0,l.forceKeepAttr=void 0,dt("uponSanitizeAttribute",e,l),r=l.attrValue,!l.forceKeepAttr&&(ct(s,e),l.keepAttr))if(T(/\/>/i,r))ct(s,e);else{Re&&(r=y(r,pe," "),r=y(r,ge," "));var f=e.nodeName.toLowerCase();if(gt(f,o,r))try{u?e.setAttributeNS(u,s,r):e.setAttribute(s,r),d(n.removed)}catch(e){}}}dt("afterSanitizeAttributes",e,null)}},yt=function e(t){var n=void 0,r=ut(t);for(dt("beforeSanitizeShadowDOM",t,null);n=r.nextNode();)dt("uponSanitizeShadowNode",n,null),pt(n)||(n.content instanceof a&&e(n.content),ht(n));dt("afterSanitizeShadowDOM",t,null)};return n.sanitize=function(e,o){var i=void 0,l=void 0,s=void 0,u=void 0,f=void 0;if((Je=!e)&&(e="\x3c!--\x3e"),"string"!=typeof e&&!mt(e)){if("function"!=typeof e.toString)throw A("toString is not a function");if("string"!=typeof(e=e.toString()))throw A("dirty is not a string, aborting")}if(!n.isSupported){if("object"===G(t.toStaticHTML)||"function"==typeof t.toStaticHTML){if("string"==typeof e)return t.toStaticHTML(e);if(mt(e))return t.toStaticHTML(e.outerHTML)}return e}if(Me||tt(o),n.removed=[],"string"==typeof e&&(je=!1),je);else if(e instanceof c)1===(l=(i=st("\x3c!----\x3e")).ownerDocument.importNode(e,!0)).nodeType&&"BODY"===l.nodeName||"HTML"===l.nodeName?i=l:i.appendChild(l);else{if(!Fe&&!Re&&!_e&&-1===e.indexOf("<"))return oe&&ze?oe.createHTML(e):e;if(!(i=st(e)))return Fe?null:ie}i&&Le&&lt(i.firstChild);for(var m=ut(je?e:i);s=m.nextNode();)3===s.nodeType&&s===u||pt(s)||(s.content instanceof a&&yt(s.content),ht(s),u=s);if(u=null,je)return e;if(Fe){if(Ie)for(f=se.call(i.ownerDocument);i.firstChild;)f.appendChild(i.firstChild);else f=i;return Ce&&(f=fe.call(r,f,!0)),f}var d=_e?i.outerHTML:i.innerHTML;return Re&&(d=y(d,pe," "),d=y(d,ge," ")),oe&&ze?oe.createHTML(d):d},n.setConfig=function(e){tt(e),Me=!0},n.clearConfig=function(){Qe=null,Me=!1},n.isValidAttribute=function(e,t,n){Qe||tt({});var r=g(e),o=g(t);return gt(r,o,n)},n.addHook=function(e,t){"function"==typeof t&&(de[e]=de[e]||[],p(de[e],t))},n.removeHook=function(e){de[e]&&d(de[e])},n.removeHooks=function(e){de[e]&&(de[e]=[])},n.removeAllHooks=function(){de={}},n}()}));
//# sourceMappingURL=purify.min.js.map
