# logos-proclaim

A Node module to communicate with the [Logos Proclaim](https://proclaim.logos.com/) presentation software through its
[App Command](https://support.proclaim.logos.com/hc/en-us/articles/19864456647053-Proclaim-App-Command-API) and
Local Wi-Fi APIs.

```TypeScript
import { ProclaimAPI } from '@hussra/logos-proclaim'

const proclaim = new ProclaimAPI()
await proclaim.configure('192.168.100.10', 'proclaim') // or just configure() if Proclaim is running on localhost
```

Status information is obtained from `proclaim.status` which has many properties, and can have event listeners registered
on it to receive notice of status changes.

```TypeScript
proclaim.status.on('connected', ({data}) => {
  console.log(`Are we connected? ${data}`)
})
```

Look at the properties of the `ProclaimStatus` class for more details.

The `proclaim.status.presentation` property will surface information about the on-air presentation (only while it is on air).

The `log` event is used to provide a logging-framework-agnostic way for the library to emit log information.

Commands using Proclaim's App Command API can be sent using `proclaim.sendAppCommand()` e.g.

```TypeScript
import { AppCommand } from '@hussra/logos-proclaim'

await proclaim.sendAppCommand({command: AppCommand.GoOnAir})
```

or

```TypeScript
await proclaim.sendAppCommand({command: AppCommand.GoToSong, index: 1})
```

One command - not available via the App Command API but only through the Local Wi-Fi API - allows you to jump to a specific
service item by ID, and slide within that service item. You will first need to find that service item's ID by digging into
`proclaim.status.presentation`, then do something like:

```TypeScript
await proclaim.goToServiceItemAndSlide('abcdef12-3456-7890-abcd-ef1234567890', 2)
```
